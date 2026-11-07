// An in-memory comment store: each document's threads, attributed to the reader, kept for the
// page session.

import type {
  CommentEntry,
  CommentStoreAdapter,
  CommentThread,
  HostResult,
  IdentityAdapter,
} from './adapters.js';

/** What the in-memory comment store starts with and how it tells time. */
export interface MemoryCommentsOptions {
  /** Threads by document id. */
  threads?: Readonly<Record<string, readonly CommentThread[]>> | undefined;
  /** The time a comment is posted at. Defaults to now. */
  now?: (() => Date) | undefined;
}

function missing<T>(threadId: string): HostResult<T> {
  return { ok: false, error: { kind: 'not-found', message: `No thread with id ${threadId}.` } };
}

/** A comment store that keeps threads in memory, attributing comments to the reader. */
export function createMemoryComments(
  identity: IdentityAdapter,
  { threads = {}, now = () => new Date() }: MemoryCommentsOptions = {},
): CommentStoreAdapter {
  const stored = new Map<string, Map<string, CommentThread>>(
    Object.entries(threads).map(([id, list]) => [
      id,
      new Map(list.map((thread) => [thread.id, structuredClone(thread)])),
    ]),
  );
  let entries = 0;
  const entry = (text: string): CommentEntry => {
    entries += 1;
    const author = identity.currentPerson().id;
    return { id: `comment-${String(entries)}`, author, text, createdAt: now().toISOString() };
  };
  const threadsOf = (documentId: string) => {
    const existing = stored.get(documentId) ?? new Map<string, CommentThread>();
    stored.set(documentId, existing);
    return existing;
  };
  const change = (
    documentId: string,
    threadId: string,
    apply: (thread: CommentThread) => void,
  ): Promise<HostResult<CommentThread>> => {
    const thread = threadsOf(documentId).get(threadId);
    if (!thread) return Promise.resolve(missing(threadId));
    apply(thread);
    return Promise.resolve({ ok: true, value: structuredClone(thread) });
  };
  return {
    list: (documentId) =>
      Promise.resolve({ ok: true, value: structuredClone([...threadsOf(documentId).values()]) }),
    create: (documentId, { id, quote, text, suggestion = null }) => {
      const list = threadsOf(documentId);
      if (list.has(id)) return Promise.resolve({ ok: false, error: { kind: 'conflict' } });
      const thread: CommentThread = {
        id,
        state: 'open',
        quote,
        suggestion,
        entries: [entry(text)],
      };
      list.set(id, thread);
      return Promise.resolve({ ok: true, value: structuredClone(thread) });
    },
    reply: (documentId, threadId, text) =>
      change(documentId, threadId, (thread) => thread.entries.push(entry(text))),
    setState: (documentId, threadId, state) =>
      change(documentId, threadId, (thread) => {
        thread.state = state;
      }),
    remove: (documentId, threadId) =>
      Promise.resolve(
        threadsOf(documentId).delete(threadId) ? { ok: true, value: null } : missing(threadId),
      ),
  };
}
