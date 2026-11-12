// What is happening in each thread besides its comments: the reader's replies being posted, the
// changes the store refused, replies still being written for the reader, such as an assistant's,
// and other people writing in it. The cards show them as the thread's activity rows.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CommentActivity, CommentStoreAdapter, CommentThread } from '../../host/index.js';

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
}

type Rows = ReadonlyMap<string, readonly ThreadActivity[]>;

const NO_ACTIVITY: Rows = new Map();
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
  const changes = useRef(0);
  const typing = useTyping(store, documentId);
  const track = useCallback(
    async <T>(threadId: string, change: TrackedChange, made: Promise<T>): Promise<T> => {
      changes.current += 1;
      const key = `change:${String(changes.current)}`;
      if (change.isPending)
        setLocal((rows) => withRow(rows, threadId, { row: { key, kind: 'pending' }, drop: '' }));
      try {
        const value = await made;
        setLocal((rows) => withRow(rows, threadId, { row: null, drop: key }));
        return value;
      } catch (cause) {
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
  const entries = useMemo(
    () =>
      entryRows(
        threads,
        settleEntry
          ? (threadId, entryId, action) =>
              void settleEntry.call(store, documentId, { threadId, entryId, action })
          : null,
      ),
    [threads, settleEntry, store, documentId],
  );
  const activity = useMemo(() => joinRows(local, entries, typing), [local, entries, typing]);
  return { activity, track };
}
