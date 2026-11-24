import type { DocumentDraft, DraftsAdapter } from '../host/session-adapters.js';

// The same adapter may keep a closing session's draft while a new session is opening.
const pendingWrites = new WeakMap<DraftsAdapter, Map<string, Promise<void>>>();

/** Reads a document's drafts after pending writes and keeps its puts and clears in order. */
export function accessDrafts(adapter: DraftsAdapter, documentId: string) {
  let found = pendingWrites.get(adapter);
  if (!found) {
    found = new Map();
    pendingWrites.set(adapter, found);
  }
  const pending = found;
  const write = (operation: () => Promise<unknown>) => {
    const previous = pending.get(documentId);
    const result = previous ? previous.then(operation) : operation();
    const done = result.then(
      () => undefined,
      () => undefined,
    );
    pending.set(documentId, done);
    void done.then(() => {
      if (pending.get(documentId) === done) pending.delete(documentId);
    });
    return done;
  };
  return {
    get: async (mode: DocumentDraft['mode']) => {
      let outstanding = pending.get(documentId);
      while (outstanding) {
        await outstanding;
        outstanding = pending.get(documentId);
      }
      return adapter.get(documentId, mode);
    },
    put: (draft: DocumentDraft) => write(async () => adapter.put(documentId, draft)),
    clear: (mode: DocumentDraft['mode']) => write(async () => adapter.clear(documentId, mode)),
  };
}
