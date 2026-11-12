// A document's comment threads as the host's comment store keeps them, the people who wrote them,
// and the changes the reader makes, each resolving once the store accepts it. Inside a
// `CommentThreadsProvider` for the same store and document, every caller shares one thread state,
// so the margin and the comments panel show each change at once, with one listing.

import type { AvatarIdentity } from '@flamboyantengineer/ui-components/avatar';
import type { EditorState } from 'prosemirror-state';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { listSuggestions } from '../../engine/index.js';
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
}

/** The thread state a provider shares with the margin and the panel inside it. */
export interface SharedCommentThreads {
  readonly store: CommentStoreAdapter;
  readonly documentId: string;
  readonly threads: CommentThreads;
}

/** The thread state of the nearest `CommentThreadsProvider`, if any. */
export const SharedCommentThreadsContext = createContext<SharedCommentThreads | null>(null);

const NO_AUTHORS: readonly string[] = [];
const NO_THREADS: ReadonlyMap<string, CommentThread> = new Map();
const NO_PEOPLE: ReadonlyMap<string, AvatarIdentity> = new Map();

function valueOf<T>(result: HostResult<T>, failed: string): T {
  if (result.ok) return result.value;
  throw new Error(result.error.message ?? failed);
}

/** Whose names to look up: the threads' authors and `others`, less the people `known` names. */
interface PeopleSources {
  readonly threads: ReadonlyMap<string, CommentThread>;
  readonly others: readonly string[];
  readonly known: ReadonlyMap<string, AvatarIdentity>;
}

// Each author's name and picture, looked up once for every id the threads and `others` name;
// people `known` already names are not looked up again, and are given with the rest.
function useCommentPeople(
  identity: IdentityAdapter,
  { threads, others, known }: PeopleSources,
): ReadonlyMap<string, AvatarIdentity> {
  const [people, setPeople] = useState<ReadonlyMap<string, AvatarIdentity>>(new Map());
  const authors = useMemo(() => {
    const ids = new Set<string>(others);
    for (const thread of threads.values())
      for (const entry of thread.entries) ids.add(entry.author);
    return [...ids].sort();
  }, [threads, others]);
  const missing = authors.filter((id) => !people.has(id) && !known.has(id));
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
  return useMemo(
    () => (known.size === 0 ? people : people.size === 0 ? known : new Map([...known, ...people])),
    [known, people],
  );
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
  const people = useCommentPeople(identity, { threads, others: NO_AUTHORS, known: NO_PEOPLE });
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

/** The thread state of the nearest provider, when it keeps this store's threads of the document. */
export function useSharedCommentThreads({
  store,
  documentId,
}: Pick<CommentThreadsOptions, 'store' | 'documentId'>): CommentThreads | null {
  const shared = useContext(SharedCommentThreadsContext);
  return shared?.store === store && shared.documentId === documentId ? shared.threads : null;
}

/** The people who made the document's suggestions, the same list while they stay the same. */
export function useSuggestionAuthors(state: EditorState): readonly string[] {
  const doc = state.doc;
  const key = useMemo(
    () =>
      [...new Set(listSuggestions(doc).flatMap(({ author }) => (author ? [author] : [])))]
        .sort()
        .join('\n'),
    [doc],
  );
  return useMemo(() => (key ? key.split('\n') : []), [key]);
}

/**
 * The threads the nearest provider keeps (`WithCommentThreads`), with `authors`, such as the
 * writers of suggestions, named beside the threads' own.
 */
export function useProvidedCommentThreads(
  options: Pick<CommentThreadsOptions, 'store' | 'documentId' | 'identity'>,
  authors: readonly string[] = NO_AUTHORS,
): CommentThreads {
  const shared = useSharedCommentThreads(options);
  const known = shared?.people ?? NO_PEOPLE;
  const people = useCommentPeople(options.identity, {
    threads: NO_THREADS,
    others: authors,
    known,
  });
  const provided = useMemo(
    () => (shared && people !== known ? { ...shared, people } : shared),
    [shared, people, known],
  );
  if (!provided) throw new Error('Comment threads are read inside WithCommentThreads.');
  return provided;
}
