// A document's comment threads as the host's comment store keeps them, the people who wrote them,
// and the changes the reader makes, each resolving once the store accepts it.

import type { AvatarIdentity } from '@flamboyantengineer/ui-components/avatar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  CommentStoreAdapter,
  CommentThread,
  HostResult,
  IdentityAdapter,
  NewCommentThread,
} from '../../host/index.js';

/** A comment of a thread, by the thread's id and its own. */
interface EntryChange {
  readonly threadId: string;
  readonly entryId: string;
}

/** The threads of a document and the changes the reader can make to them. */
export interface CommentThreads {
  /** The threads by id, once the store has listed them. */
  readonly threads: ReadonlyMap<string, CommentThread>;
  /** Who wrote each comment, by person id. */
  readonly people: ReadonlyMap<string, AvatarIdentity>;
  /** Why the threads could not be listed, if they could not. */
  readonly error: string | null;
  create(thread: NewCommentThread): Promise<CommentThread>;
  reply(threadId: string, text: string): Promise<CommentThread>;
  setState(threadId: string, state: CommentThread['state']): Promise<CommentThread>;
  remove(threadId: string): Promise<void>;
  /** Changes the reader's own comment, while the store can. */
  edit: ((change: EntryChange & { text: string }) => Promise<CommentThread>) | null;
  /** Deletes the reader's own reply, while the store can. */
  removeEntry: ((entry: EntryChange) => Promise<CommentThread>) | null;
  /** Adds or takes back the reader's reaction to a comment, while the store can. */
  react:
    | ((reaction: EntryChange & { emoji: string; reacted: boolean }) => Promise<CommentThread>)
    | null;
}

/** Where a document's threads are kept, and who the reader is. */
export interface CommentThreadsOptions {
  store: CommentStoreAdapter;
  documentId: string;
  identity: IdentityAdapter;
  /** The message a failed change shows when the store gives none. */
  failed: string;
  /** Other people to name beside the threads' authors, such as the authors of suggestions. */
  authors?: readonly string[] | undefined;
}

const NO_AUTHORS: readonly string[] = [];

function valueOf<T>(result: HostResult<T>, failed: string): T {
  if (result.ok) return result.value;
  throw new Error(result.error.message ?? failed);
}

// Each author's name and picture, looked up once for every id the threads and `others` name.
function usePeople(
  identity: IdentityAdapter,
  threads: ReadonlyMap<string, CommentThread>,
  others: readonly string[],
) {
  const [people, setPeople] = useState<ReadonlyMap<string, AvatarIdentity>>(new Map());
  const authors = useMemo(() => {
    const ids = new Set<string>(others);
    for (const thread of threads.values())
      for (const entry of thread.entries) ids.add(entry.author);
    return [...ids].sort();
  }, [threads, others]);
  const missing = authors.filter((id) => !people.has(id));
  const key = missing.join('\n');
  useEffect(() => {
    if (!key) return;
    let current = true;
    void identity.resolvePeople(key.split('\n')).then((found) => {
      if (!current) return;
      setPeople((known) => {
        const next = new Map(known);
        for (const person of found)
          next.set(person.id, { name: person.name, src: person.avatarUrl });
        return next;
      });
    });
    return () => {
      current = false;
    };
  }, [identity, key]);
  return people;
}

/** Lists a document's threads from the host's store and keeps them as the reader changes them. */
export function useCommentThreads({
  store,
  documentId,
  identity,
  failed,
  authors = NO_AUTHORS,
}: CommentThreadsOptions): CommentThreads {
  const [threads, setThreads] = useState<ReadonlyMap<string, CommentThread>>(new Map());
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void store.list(documentId, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      setError(result.ok ? null : (result.error.message ?? failed));
      setThreads(new Map(result.ok ? result.value.map((thread) => [thread.id, thread]) : []));
    });
    // A store that tells of changes keeps the threads current, whoever changes them.
    const stop = store.subscribe?.(documentId, (threads) => {
      if (!controller.signal.aborted) {
        setThreads(new Map(threads.map((thread) => [thread.id, thread])));
      }
    });
    return () => {
      controller.abort();
      stop?.();
    };
  }, [store, documentId, failed]);
  const keep = useCallback(
    (result: HostResult<CommentThread> | undefined) => {
      if (!result) throw new Error(failed);
      const thread = valueOf(result, failed);
      setThreads((current) => new Map(current).set(thread.id, thread));
      return thread;
    },
    [failed],
  );
  const people = usePeople(identity, threads, authors);
  return useMemo(
    () => ({
      threads,
      people,
      error,
      create: async (thread) => keep(await store.create(documentId, thread)),
      reply: async (threadId, text) => keep(await store.reply(documentId, threadId, text)),
      setState: async (threadId, state) => keep(await store.setState(documentId, threadId, state)),
      edit: store.edit
        ? async (change) => keep(await store.edit?.call(store, documentId, change))
        : null,
      removeEntry: store.removeEntry
        ? async (entry) => keep(await store.removeEntry?.call(store, documentId, entry))
        : null,
      react: store.react
        ? async (reaction) => keep(await store.react?.call(store, documentId, reaction))
        : null,
      remove: async (threadId) => {
        valueOf(await store.remove(documentId, threadId), failed);
        setThreads((current) => {
          const next = new Map(current);
          next.delete(threadId);
          return next;
        });
      },
    }),
    [threads, people, error, keep, store, documentId, failed],
  );
}
