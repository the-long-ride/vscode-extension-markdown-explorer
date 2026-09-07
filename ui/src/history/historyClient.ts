import type { PlatformBridge } from '../platform/bridge';
import type { HostMessage, WebviewMessage } from '../types';
import type {
  GitCapability,
  GitComparisonSources,
  GitCompareSide,
  GitRevisionSnapshot,
  GitRevisionSummary,
} from './contracts';

type RequestKind = 'capability' | 'history' | 'revision' | 'comparison';

type PendingRequest = {
  readonly kind: RequestKind;
  readonly resolve: (value: unknown) => void;
  readonly reject: (reason?: unknown) => void;
};

export interface HistoryClient {
  getCapability(): Promise<GitCapability>;
  listDocumentHistory(filePath: string, limit?: number): Promise<readonly GitRevisionSummary[]>;
  readGitRevision(oid: string, path: string): Promise<GitRevisionSnapshot>;
  compareGitRevisions(left: GitCompareSide, right: GitCompareSide): Promise<GitComparisonSources>;
  dispose(): void;
}

function defaultRequestId(): string {
  return `history-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function failure(reason: string | undefined, fallback: string): Error {
  return new Error(reason || fallback);
}

export function createHistoryClient(
  bridge: PlatformBridge,
  nextRequestId: () => string = defaultRequestId,
): HistoryClient {
  const pending = new Map<string, PendingRequest>();
  let disposed = false;

  const unsubscribe = bridge.onMessage((rawMessage: HostMessage) => {
    const message = rawMessage as HostMessage & { readonly requestId?: string };
    if (!message.requestId) return;
    const request = pending.get(message.requestId);
    if (!request) return;

    switch (request.kind) {
      case 'capability':
        if (message.command !== 'gitCapabilityResult') return;
        pending.delete(message.requestId);
        request.resolve((message as any).capability as GitCapability);
        return;
      case 'history':
        if (message.command !== 'documentHistoryResult') return;
        pending.delete(message.requestId);
        if (!(message as any).ok) {
          request.reject(failure((message as any).reason, 'Unable to read document history'));
          return;
        }
        request.resolve((message as any).revisions as readonly GitRevisionSummary[]);
        return;
      case 'revision':
        if (message.command !== 'gitRevisionResult') return;
        pending.delete(message.requestId);
        if (!(message as any).ok || !(message as any).snapshot) {
          request.reject(failure((message as any).reason, 'Unable to read Git revision'));
          return;
        }
        request.resolve((message as any).snapshot as GitRevisionSnapshot);
        return;
      case 'comparison':
        if (message.command !== 'gitComparisonResult') return;
        pending.delete(message.requestId);
        if (!(message as any).ok || typeof (message as any).leftSource !== 'string' || typeof (message as any).rightSource !== 'string') {
          request.reject(failure((message as any).reason, 'Unable to compare Git revisions'));
          return;
        }
        request.resolve({
          leftSource: (message as any).leftSource,
          rightSource: (message as any).rightSource,
          leftLabel: (message as any).leftLabel,
          rightLabel: (message as any).rightLabel,
        } satisfies GitComparisonSources);
    }
  });

  function request<T>(kind: RequestKind, createMessage: (requestId: string) => WebviewMessage): Promise<T> {
    if (disposed) return Promise.reject(new Error('History client has been disposed'));
    const requestId = nextRequestId();
    return new Promise<T>((resolve, reject) => {
      pending.set(requestId, {
        kind,
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      bridge.postMessage(createMessage(requestId));
    });
  }

  return {
    getCapability() {
      return request<GitCapability>('capability', (requestId) => ({
        command: 'getGitCapability',
        requestId,
      } as WebviewMessage));
    },
    listDocumentHistory(filePath, limit) {
      return request<readonly GitRevisionSummary[]>('history', (requestId) => ({
        command: 'listDocumentHistory',
        requestId,
        filePath,
        ...(limit === undefined ? {} : { limit }),
      } as WebviewMessage));
    },
    readGitRevision(oid, path) {
      return request<GitRevisionSnapshot>('revision', (requestId) => ({
        command: 'readGitRevision',
        requestId,
        oid,
        path,
      } as WebviewMessage));
    },
    compareGitRevisions(left, right) {
      return request<GitComparisonSources>('comparison', (requestId) => ({
        command: 'compareGitRevisions',
        requestId,
        left,
        right,
      } as WebviewMessage));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribe();
      const error = new Error('History client has been disposed');
      for (const request of pending.values()) request.reject(error);
      pending.clear();
    },
  };
}
