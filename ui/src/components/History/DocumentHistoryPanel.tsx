import { useMemo, useState } from 'react';
import type { GitRevisionSummary } from '../../history/contracts';
import type { HistoryClient } from '../../history/historyClient';

interface DocumentHistoryPanelProps {
  filePath: string;
  client: HistoryClient;
  onClose: () => void;
  onViewRevision: (revision: GitRevisionSummary) => void | Promise<void>;
  onCompareCurrent?: (revision: GitRevisionSummary) => void | Promise<void>;
  onCompareSelected?: (left: GitRevisionSummary, right: GitRevisionSummary) => void | Promise<void>;
}

function capabilityMessage(reason?: string): string {
  if (reason === 'unsupported-runtime') return 'Git history is not supported in this runtime.';
  if (reason === 'git-unavailable') return 'Git is unavailable on this system.';
  if (reason === 'not-repository') return 'This document is not inside a Git repository.';
  return 'Git history is unavailable.';
}

export function DocumentHistoryPanel({
  filePath,
  client,
  onClose,
  onViewRevision,
  onCompareCurrent,
  onCompareSelected,
}: DocumentHistoryPanelProps) {
  const [revisions, setRevisions] = useState<readonly GitRevisionSummary[]>([]);
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const selectedRevisions = useMemo(
    () => selected.map((oid) => revisions.find((revision) => revision.oid === oid)).filter((revision): revision is GitRevisionSummary => Boolean(revision)),
    [revisions, selected],
  );

  const load = async () => {
    setStatus('loading');
    setMessage('');
    try {
      const capability = await client.getCapability();
      if (!capability.supported) {
        setStatus('error');
        setMessage(capabilityMessage(capability.reason));
        return;
      }
      setRevisions(await client.listDocumentHistory(filePath));
      setStatus('ready');
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const toggleSelected = (oid: string) => {
    setSelected((current) => current.includes(oid)
      ? current.filter((item) => item !== oid)
      : current.length >= 2 ? [current[1], oid] : [...current, oid]);
  };

  return (
    <div className="history-panel-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <aside className="document-history-panel" role="dialog" aria-modal="true" aria-label="Document history">
        <header className="document-history-panel__header">
          <div>
            <h2>History</h2>
            <div className="document-history-panel__path" title={filePath}>{filePath}</div>
          </div>
          <button type="button" className="btn" onClick={onClose} aria-label="Close history">Close</button>
        </header>

        {status === 'idle' && (
          <button type="button" className="btn document-history-panel__load" onClick={() => { void load(); }}>
            Load history
          </button>
        )}
        {status === 'loading' && <div role="status">Loading history…</div>}
        {status === 'error' && (
          <div className="document-history-panel__error" role="status">
            <p>{message}</p>
            <button type="button" className="btn" onClick={() => { void load(); }}>Retry</button>
          </div>
        )}
        {status === 'ready' && revisions.length === 0 && <div role="status">No Git history for this document.</div>}

        {status === 'ready' && revisions.length > 0 && (
          <>
            {onCompareSelected && (
              <div className="document-history-panel__selection-actions">
                <button
                  type="button"
                  className="btn"
                  disabled={selectedRevisions.length !== 2}
                  onClick={() => {
                    if (selectedRevisions.length === 2) void onCompareSelected(selectedRevisions[0], selectedRevisions[1]);
                  }}
                >
                  Compare selected
                </button>
              </div>
            )}
            <ol className="document-history-panel__list">
              {revisions.map((revision) => (
                <li key={revision.oid} className="document-history-panel__revision">
                  <div className="document-history-panel__revision-main">
                    {onCompareSelected && (
                      <input
                        type="checkbox"
                        aria-label={`Select ${revision.shortOid}`}
                        checked={selected.includes(revision.oid)}
                        onChange={() => toggleSelected(revision.oid)}
                      />
                    )}
                    <div>
                      <div className="document-history-panel__subject">{revision.subject || '(no commit message)'}</div>
                      <div className="document-history-panel__meta">
                        <code>{revision.shortOid}</code>
                        <span>{revision.author}</span>
                        <time dateTime={revision.authoredAt}>{new Date(revision.authoredAt).toLocaleString()}</time>
                      </div>
                      <div className="document-history-panel__revision-path">{revision.path}</div>
                    </div>
                  </div>
                  <div className="document-history-panel__actions">
                    <button type="button" className="btn" onClick={() => { void onViewRevision(revision); }}>View revision</button>
                    {onCompareCurrent && (
                      <button type="button" className="btn" onClick={() => { void onCompareCurrent(revision); }}>Compare with current</button>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </>
        )}
      </aside>
    </div>
  );
}
