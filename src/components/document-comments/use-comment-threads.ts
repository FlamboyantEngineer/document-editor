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
}

/** Where a document's threads are kept, and who the reader is. */
export interface CommentThreadsOptions {
  store: CommentStoreAdapter;
  documentId: string;
  identity: IdentityAdapter;
  /** The message a failed change shows when the store gives none. */
  failed: string;
}

function valueOf<T>(result: HostResult<T>, failed: string): T {
  if (result.ok) return result.value;
  throw new Error(result.error.message ?? failed);
}

// Each author's name and picture, looked up once for every id the threads name.
function usePeople(identity: IdentityAdapter, threads: ReadonlyMap<string, CommentThread>) {
  const [people, setPeople] = useState<ReadonlyMap<string, AvatarIdentity>>(new Map());
  const authors = useMemo(() => {
    const ids = new Set<string>();
    for (const thread of threads.values())
      for (const entry of thread.entries) ids.add(entry.author);
    return [...ids].sort();
  }, [threads]);
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
    return () => controller.abort();
  }, [store, documentId, failed]);
  const keep = useCallback(
    (result: HostResult<CommentThread>) => {
      const thread = valueOf(result, failed);
      setThreads((current) => new Map(current).set(thread.id, thread));
      return thread;
    },
    [failed],
  );
  const people = usePeople(identity, threads);
  return useMemo(
    () => ({
      threads,
      people,
      error,
      create: async (thread) => keep(await store.create(documentId, thread)),
      reply: async (threadId, text) => keep(await store.reply(documentId, threadId, text)),
      setState: async (threadId, state) => keep(await store.setState(documentId, threadId, state)),
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
