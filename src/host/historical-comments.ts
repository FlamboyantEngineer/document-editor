import type { HostResult } from './adapters.js';
import type { CommentStoreAdapter, CommentThread } from './comment-adapters.js';

/** Adapts captured discussion to existing comment providers without any live reads or writes. */
export function createHistoricalComments(
  documentId: string,
  threads: readonly CommentThread[],
): CommentStoreAdapter {
  const captured = structuredClone(threads);
  const denied = (): Promise<HostResult<never>> =>
    Promise.resolve({
      ok: false,
      error: { kind: 'denied', message: 'Historical discussion is read-only.' },
    });
  return {
    list: (id) =>
      Promise.resolve(
        id === documentId
          ? { ok: true, value: structuredClone([...captured]) }
          : { ok: false, error: { kind: 'not-found' } },
      ),
    create: denied,
    reply: denied,
    setState: denied,
    remove: denied,
    edit: denied,
    removeEntry: denied,
    react: denied,
    decide: denied,
    update: denied,
    settleEntry: denied,
  };
}
