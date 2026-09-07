const { execFile } = require('node:child_process');
const { readFile, stat } = require('node:fs/promises');
const path = require('node:path');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);
const MAX_GIT_OUTPUT_BYTES = 16 * 1024 * 1024;
const FULL_OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i;
const DEFAULT_HISTORY_LIMIT = 100;
const MAX_HISTORY_LIMIT = 500;

class GitHistoryError extends Error {
  constructor(message, reason = 'git-error', cause) {
    super(message, cause ? { cause } : undefined);
    this.name = 'GitHistoryError';
    this.reason = reason;
  }
}

function normalizeHistoryLimit(limit) {
  if (!Number.isFinite(limit)) return DEFAULT_HISTORY_LIMIT;
  return Math.max(1, Math.min(MAX_HISTORY_LIMIT, Math.trunc(limit)));
}

function toGitPath(value) {
  return value.split(path.sep).join('/');
}

function isSameOrInside(basePath, targetPath) {
  const relative = path.relative(path.resolve(basePath), path.resolve(targetPath));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function workspaceDirectory(workspacePath) {
  if (typeof workspacePath !== 'string' || !workspacePath.trim()) {
    throw new GitHistoryError('A workspace path is required', 'not-repository');
  }
  const resolved = path.resolve(workspacePath);
  try {
    const info = await stat(resolved);
    return info.isFile() ? path.dirname(resolved) : resolved;
  } catch {
    return resolved;
  }
}

async function runGit(cwd, args) {
  try {
    const { stdout } = await execFileAsync('git', args, {
      cwd,
      windowsHide: true,
      maxBuffer: MAX_GIT_OUTPUT_BYTES,
      encoding: 'utf8',
    });
    return stdout;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new GitHistoryError('Git executable is unavailable', 'git-unavailable', error);
    }
    if (error?.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' || /maxBuffer/i.test(String(error?.message || ''))) {
      throw new GitHistoryError('Git output exceeded the allowed size', 'output-too-large', error);
    }
    throw new GitHistoryError(String(error?.stderr || error?.message || 'Git command failed').trim(), 'git-command-failed', error);
  }
}

async function resolveRepository(workspacePath) {
  const cwd = await workspaceDirectory(workspacePath);
  const root = (await runGit(cwd, ['rev-parse', '--show-toplevel'])).trim();
  if (!root) throw new GitHistoryError('The workspace is not a Git repository', 'not-repository');
  return path.resolve(root);
}

async function detectGitCapability(workspacePath) {
  try {
    const repositoryRoot = await resolveRepository(workspacePath);
    return { supported: true, repositoryRoot };
  } catch (error) {
    if (error instanceof GitHistoryError && error.reason === 'git-unavailable') {
      return { supported: false, reason: 'git-unavailable' };
    }
    return { supported: false, reason: 'not-repository' };
  }
}

function repositoryRelativePath(repositoryRoot, filePath) {
  if (typeof filePath !== 'string' || !filePath.trim()) {
    throw new GitHistoryError('A document path is required', 'outside-repository');
  }
  const absolute = path.isAbsolute(filePath)
    ? path.resolve(filePath)
    : path.resolve(repositoryRoot, filePath);
  if (!isSameOrInside(repositoryRoot, absolute)) {
    throw new GitHistoryError('Document path is outside repository', 'outside-repository');
  }
  const relative = path.relative(repositoryRoot, absolute);
  if (!relative || relative === '.') {
    throw new GitHistoryError('Document path must identify a file inside the repository', 'outside-repository');
  }
  return toGitPath(relative);
}

function validateGitPath(repositoryRoot, gitPath) {
  if (typeof gitPath !== 'string' || !gitPath.trim() || path.isAbsolute(gitPath)) {
    throw new GitHistoryError('Document path is outside repository', 'outside-repository');
  }
  const normalized = gitPath.replace(/\\/g, '/');
  const absolute = path.resolve(repositoryRoot, ...normalized.split('/'));
  if (!isSameOrInside(repositoryRoot, absolute)) {
    throw new GitHistoryError('Document path is outside repository', 'outside-repository');
  }
  return toGitPath(path.relative(repositoryRoot, absolute));
}

function validateOid(oid) {
  if (typeof oid !== 'string' || !FULL_OID.test(oid)) {
    throw new GitHistoryError('Invalid revision identifier', 'invalid-revision');
  }
  return oid.toLowerCase();
}

function parseHistory(output, initialPath) {
  const records = output.split('\x1e').slice(1);
  const revisions = [];
  let trackedPath = initialPath;

  for (const rawRecord of records) {
    const lines = rawRecord.replace(/^\r?\n/, '').split(/\r?\n/);
    const header = lines.shift() || '';
    const [oid, author = '', authoredAt = '', subject = ''] = header.split('\x1f');
    if (!FULL_OID.test(oid || '')) continue;

    const snapshotPath = trackedPath;
    revisions.push({
      oid,
      shortOid: oid.slice(0, 7),
      author,
      authoredAt,
      subject,
      path: snapshotPath,
    });

    for (const line of lines) {
      if (!line) continue;
      const fields = line.split('\t');
      if (!/^R\d+$/.test(fields[0] || '') || fields.length < 3) continue;
      const oldPath = fields[1];
      const newPath = fields[2];
      if (newPath === trackedPath) {
        trackedPath = oldPath;
        break;
      }
    }
  }

  return revisions;
}

async function listDocumentHistory({ workspacePath, filePath, limit } = {}) {
  const repositoryRoot = await resolveRepository(workspacePath);
  const gitPath = repositoryRelativePath(repositoryRoot, filePath);
  const output = await runGit(repositoryRoot, [
    'log',
    '--follow',
    '--format=%x1e%H%x1f%an%x1f%aI%x1f%s',
    '--name-status',
    '-M',
    '-n',
    String(normalizeHistoryLimit(limit)),
    '--',
    gitPath,
  ]);
  return parseHistory(output, gitPath);
}

async function readGitRevision({ workspacePath, oid, path: revisionPath } = {}) {
  const validatedOid = validateOid(oid);
  const repositoryRoot = await resolveRepository(workspacePath);
  const gitPath = validateGitPath(repositoryRoot, revisionPath);
  const source = await runGit(repositoryRoot, ['show', `${validatedOid}:${gitPath}`]);
  return { oid: validatedOid, path: gitPath, source };
}

async function readCompareSide(repositoryRoot, side) {
  if (!side || typeof side !== 'object') {
    throw new GitHistoryError('Invalid comparison side', 'invalid-comparison');
  }
  if (side.kind === 'revision') {
    const oid = validateOid(side.oid);
    const gitPath = validateGitPath(repositoryRoot, side.path);
    return {
      source: await runGit(repositoryRoot, ['show', `${oid}:${gitPath}`]),
      label: `${oid.slice(0, 7)}:${gitPath}`,
    };
  }
  if (side.kind === 'current') {
    const gitPath = repositoryRelativePath(repositoryRoot, side.path);
    const absolutePath = path.resolve(repositoryRoot, ...gitPath.split('/'));
    return {
      source: await readFile(absolutePath, 'utf8'),
      label: `Current:${gitPath}`,
    };
  }
  throw new GitHistoryError('Invalid comparison side', 'invalid-comparison');
}

async function compareGitSources({ workspacePath, left, right } = {}) {
  const repositoryRoot = await resolveRepository(workspacePath);
  const [leftResult, rightResult] = await Promise.all([
    readCompareSide(repositoryRoot, left),
    readCompareSide(repositoryRoot, right),
  ]);
  return {
    leftSource: leftResult.source,
    rightSource: rightResult.source,
    leftLabel: leftResult.label,
    rightLabel: rightResult.label,
  };
}

module.exports = {
  FULL_OID,
  GitHistoryError,
  MAX_GIT_OUTPUT_BYTES,
  compareGitSources,
  detectGitCapability,
  listDocumentHistory,
  parseHistory,
  readGitRevision,
};
