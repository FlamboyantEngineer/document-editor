// What is happening in each thread besides its comments: the reader's replies being posted, the
// changes the store refused, replies still being written for the reader, such as an assistant's,
// and other people writing in it. The cards show them as the thread's activity rows.

import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  CommentActivity,
  CommentStoreAdapter,
  CommentThread,
  HostResult,
} from '../../host/index.js';

/** One row of a thread's activity. */
export interface ThreadActivity {
  readonly key: string;
  readonly kind: 'pending' | 'typing' | 'error';
  /** Who is writing, or whose reply is being written, by person id. */
  readonly person?: string | undefined;
  /** Why a change failed, as the store said or the failure message. */
  readonly message?: string | undefined;
  readonly onCancel?: (() => void) | undefined;
  readonly onRetry?: (() => void) | undefined;
}

/** How a change the reader makes in a thread shows while the store takes it. */
export interface TrackedChange {
  /** Shows a pending row until the store answers, as for a reply. */
  readonly isPending?: boolean | undefined;
  /** Offers to make the change again when it fails. */
  readonly retry?: (() => void) | undefined;
  /** Shows no row when it fails, for a change whose own control reports the failure. */
  readonly isQuiet?: boolean | undefined;
}

type Rows = ReadonlyMap<string, readonly ThreadActivity[]>;

/** What the store answered, or the error a refusal is: its message, else the failure message. */
export function valueOf<T>(result: HostResult<T>, failed: string): T {
  if (result.ok) return result.value;
  throw new Error(result.error.message ?? failed);
}

const NO_ACTIVITY: Rows = new Map();

// How many changes have been tracked, which keys each change's row apart from every other.
let tracked = 0;
const NO_TYPING: readonly CommentActivity[] = [];

function withRow(
  rows: Rows,
  threadId: string,
  { row, drop }: { row: ThreadActivity | null; drop: string },
): Rows {
  const next = new Map(rows);
  const kept = (rows.get(threadId) ?? []).filter((each) => each.key !== drop);
  const list = row ? [...kept, row] : kept;
  if (list.length) next.set(threadId, list);
  else next.delete(threadId);
  return next;
}

// Rows for the replies the store is still writing for the reader, or could not.
function entryRows(
  threads: ReadonlyMap<string, CommentThread>,
  settle: ((threadId: string, entryId: string, action: 'cancel' | 'retry') => void) | null,
): Rows {
  const rows = new Map<string, ThreadActivity[]>();
  for (const thread of threads.values()) {
    for (const entry of thread.entries) {
      if (!entry.status) continue;
      const act = (action: 'cancel' | 'retry') =>
        settle ? () => settle(thread.id, entry.id, action) : undefined;
      const row: ThreadActivity = {
        key: `entry:${entry.id}`,
        kind: entry.status === 'pending' ? 'pending' : 'error',
        person: entry.author,
        message: entry.status === 'failed' ? entry.text : undefined,
        onCancel: act('cancel'),
        onRetry: entry.status === 'failed' ? act('retry') : undefined,
      };
      rows.set(thread.id, [...(rows.get(thread.id) ?? []), row]);
    }
  }
  return rows;
}

function joinRows(...all: Rows[]): Rows {
  const joined = new Map<string, readonly ThreadActivity[]>();
  for (const rows of all)
    for (const [id, list] of rows) joined.set(id, [...(joined.get(id) ?? []), ...list]);
  return joined;
}

// Who else is writing in which thread, as a store that tells of it says.
function useTyping(store: CommentStoreAdapter, documentId: string): Rows {
  // What the store last told, and for which document, so another document starts with none.
  const [told, setTold] = useState<{
    store: CommentStoreAdapter;
    documentId: string;
    activity: readonly CommentActivity[];
  } | null>(null);
  useEffect(
    () =>
      store.subscribeActivity?.(documentId, (activity) => setTold({ store, documentId, activity })),
    [store, documentId],
  );
  const activity =
    told?.store === store && told.documentId === documentId ? told.activity : NO_TYPING;
  return useMemo(() => {
    const rows = new Map<string, ThreadActivity[]>();
    for (const { threadId, person } of activity) {
      const row: ThreadActivity = { key: `typing:${person}`, kind: 'typing', person };
      rows.set(threadId, [...(rows.get(threadId) ?? []), row]);
    }
    return rows;
  }, [activity]);
}

/** Each thread's activity rows, and how the reader's changes add theirs. */
export function useThreadActivity(
  store: CommentStoreAdapter,
  {
    documentId,
    threads,
    failed,
  }: {
    documentId: string;
    threads: ReadonlyMap<string, CommentThread>;
    failed: string;
  },
) {
  const [local, setLocal] = useState<Rows>(NO_ACTIVITY);
  const typing = useTyping(store, documentId);
  const track = useCallback(
    async <T>(threadId: string, change: TrackedChange, made: Promise<T>): Promise<T> => {
      tracked += 1;
      const key = `change:${String(tracked)}`;
      if (change.isPending)
        setLocal((rows) => withRow(rows, threadId, { row: { key, kind: 'pending' }, drop: '' }));
      try {
        const value = await made;
        setLocal((rows) => withRow(rows, threadId, { row: null, drop: key }));
        return value;
      } catch (cause) {
        if (change.isQuiet) {
          setLocal((rows) => withRow(rows, threadId, { row: null, drop: key }));
          throw cause;
        }
        const dismiss = () => setLocal((rows) => withRow(rows, threadId, { row: null, drop: key }));
        const row: ThreadActivity = {
          key,
          kind: 'error',
          message: cause instanceof Error ? cause.message : failed,
          onCancel: dismiss,
          onRetry:
            change.retry &&
            (() => {
              dismiss();
              change.retry?.();
            }),
        };
        setLocal((rows) => withRow(rows, threadId, { row, drop: key }));
        throw cause;
      }
    },
    [failed],
  );
  const { settleEntry } = store;
  // A reply written for the reader, cancelled or retried; a refusal shows on the thread as a row,
  // and nothing else waits on it.
  const settle = useCallback(
    (threadId: string, entryId: string, action: 'cancel' | 'retry') => {
      if (!settleEntry) return;
      const asked = settleEntry
        .call(store, documentId, { threadId, entryId, action })
        .then((result) => valueOf(result, failed));
      void track(threadId, {}, asked).catch(() => undefined);
    },
    [settleEntry, store, documentId, track, failed],
  );
  const entries = useMemo(
    () => entryRows(threads, settleEntry ? settle : null),
    [threads, settleEntry, settle],
  );
  const activity = useMemo(() => joinRows(local, entries, typing), [local, entries, typing]);
  return { activity, track };
}
