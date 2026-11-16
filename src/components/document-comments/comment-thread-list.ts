// A document's threads as the store lists them and tells of changes, kept through the reader's own
// changes: a listing that was asked for before one of them keeps the thread as that change left it,
// and a listing that fails keeps the threads already shown.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CommentStoreAdapter, CommentThread } from '../../host/index.js';

type Threads = ReadonlyMap<string, CommentThread>;

/** The threads, why they could not be listed, and how the reader's changes are kept. */
interface ThreadList {
  readonly threads: Threads;
  readonly error: string | null;
  /** Notes that the reader is changing a thread, before the store is asked. */
  readonly write: (threadId: string) => void;
  /**
   * Ends the reader's change: keeps the thread as the store returned it, forgets it (`null`), or,
   * when the store refused the change (`undefined`), leaves it as it was.
   */
  readonly settle: (threadId: string, thread: CommentThread | null | undefined) => void;
}

/**
 * A thread as the cards show it: a deleted thread not at all, and a thread without its deleted
 * replies, which the store keeps as a record of them.
 */
function shownThread(thread: CommentThread): CommentThread | null {
  if (thread.state === 'deleted') return null;
  const entries = thread.entries.filter((entry) => entry.deletedAt === undefined);
  return entries.length === thread.entries.length ? thread : { ...thread, entries };
}

/**
 * The threads of `listed`, except those `kept` names, which stay as they are in `current`: the
 * threads the reader changed after the listing was asked for, which it may not show yet.
 */
function mergeListed(
  current: Threads,
  listed: readonly CommentThread[],
  kept: ReadonlySet<string>,
): Threads {
  const next = new Map<string, CommentThread>();
  for (const thread of listed) {
    const shown = kept.has(thread.id) ? null : shownThread(thread);
    if (shown) next.set(thread.id, shown);
  }
  for (const id of kept) {
    const thread = current.get(id);
    if (thread) next.set(id, thread);
  }
  return next;
}

/** Lists a document's threads from the store and follows its changes. */
export function useThreadList(
  store: CommentStoreAdapter,
  { documentId, failed }: { documentId: string; failed: string },
): ThreadList {
  const [threads, setThreads] = useState<Threads>(new Map());
  const [error, setError] = useState<string | null>(null);
  // Each thread the reader changed, by the count of changes when it was last changed, and the
  // threads whose changes the store has not answered yet.
  const writes = useRef({ count: 0, at: new Map<string, number>(), open: new Set<string>() });
  useEffect(() => {
    const controller = new AbortController();
    const since = writes.current.count;
    const keptSince = (from: number) =>
      new Set([...writes.current.at].flatMap(([id, at]) => (at > from ? [id] : [])));
    store.list(documentId, controller.signal).then(
      (result) => {
        if (controller.signal.aborted) return;
        if (!result.ok) {
          setError(result.error.message ?? failed);
          return;
        }
        setError(null);
        setThreads((current) => mergeListed(current, result.value, keptSince(since)));
      },
      // A store that throws instead of answering has failed all the same.
      () => {
        if (!controller.signal.aborted) setError(failed);
      },
    );
    // A store that tells of changes keeps the threads current, whoever changes them; it tells of
    // the state after every change it has taken, so only changes it has not answered are kept.
    const stop = store.subscribe?.(documentId, (listed) => {
      if (controller.signal.aborted) return;
      setThreads((current) => mergeListed(current, listed, new Set(writes.current.open)));
    });
    return () => {
      controller.abort();
      stop?.();
    };
  }, [store, documentId, failed]);
  const write = useCallback((threadId: string) => {
    writes.current.count += 1;
    writes.current.at.set(threadId, writes.current.count);
    writes.current.open.add(threadId);
  }, []);
  const settle = useCallback((threadId: string, thread: CommentThread | null | undefined) => {
    writes.current.open.delete(threadId);
    if (thread === undefined) return;
    setThreads((current) => {
      const next = new Map(current);
      const shown = thread && shownThread(thread);
      if (shown) next.set(threadId, shown);
      else next.delete(threadId);
      return next;
    });
  }, []);
  return { threads, error, write, settle };
}
