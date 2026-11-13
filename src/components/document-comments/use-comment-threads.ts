// A document's comment threads as the host's comment store keeps them, the people who wrote them,
// and the changes the reader makes, each resolving once the store accepts it. Inside a
// `CommentThreadsProvider` for the same store and document, every caller shares one thread state,
// so the margin and the comments panel show each change at once, with one listing.

import type { AvatarIdentity } from '@flamboyantengineer/ui-components/avatar';
import type { EditorState } from 'prosemirror-state';
import { createContext, useCallback, useContext, useMemo } from 'react';
import { listSuggestions } from '../../engine/index.js';
import type {
  CommentStoreAdapter,
  CommentThread,
  IdentityAdapter,
  NewCommentThread,
} from '../../host/index.js';
import { usePeople } from '../../utils/use-people.js';
import {
  type EntryChange,
  threadActions,
  type ThreadChange,
  type ThreadDecision,
} from './comment-thread-actions.js';
import { useThreadList } from './comment-thread-list.js';
import { type ThreadActivity, useThreadActivity, valueOf } from './use-thread-activity.js';

/** The threads of a document and the changes the reader can make to them. */
export interface CommentThreads {
  /** The threads by id, once the store has listed them. */
  readonly threads: ReadonlyMap<string, CommentThread>;
  /** Who wrote each comment, by person id. */
  readonly people: ReadonlyMap<string, AvatarIdentity>;
  /** Why the threads could not be listed, if they could not; the threads listed before stay. */
  readonly error: string | null;
  /** What is happening in each thread besides its comments, by thread id. */
  readonly activity: ReadonlyMap<string, readonly ThreadActivity[]>;
  create(thread: NewCommentThread): Promise<CommentThread>;
  /** Posts a reply; a failure shows as the thread's activity, with Retry, and resolves `null`. */
  reply(threadId: string, text: string): Promise<CommentThread | null>;
  setState(threadId: string, state: CommentThread['state']): Promise<CommentThread>;
  remove(threadId: string): Promise<void>;
  /** Changes the reader's own comment, while the store can. */
  edit: ((change: EntryChange & { text: string }) => Promise<CommentThread>) | null;
  /** Deletes the reader's own reply, while the store can. */
  removeEntry: ((entry: EntryChange) => Promise<CommentThread>) | null;
  /** Adds or takes back the reader's reaction to a comment, or to the thread without `entryId`. */
  react:
    | ((reaction: {
        threadId: string;
        entryId?: string | undefined;
        emoji: string;
        reacted: boolean;
      }) => Promise<CommentThread>)
    | null;
  /** Records how a thread's suggestion was decided and resolves it, while the store can. */
  decide: ((decision: ThreadDecision) => Promise<CommentThread>) | null;
  /** Changes a thread's quote, target or change, while the store can. */
  update:
    | ((
        threadId: string,
        fields: Partial<Pick<CommentThread, 'quote' | 'target' | 'change'>>,
      ) => Promise<CommentThread>)
    | null;
  /** Tells others the reader is writing in a thread, or has stopped, while the store can. */
  setTyping: ((threadId: string, isTyping: boolean) => void) | null;
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
  /**
   * Whether the provider records the decisions the editor's transactions make on suggestions; a
   * command that goes through the editor's view then records none itself (DOCE-COMMENTS-2.19).
   */
  readonly recordsDecisions?: boolean | undefined;
}

/** The thread state of the nearest `CommentThreadsProvider`, if any. */
export const SharedCommentThreadsContext = createContext<SharedCommentThreads | null>(null);

const NO_AUTHORS: readonly string[] = [];
const NO_THREADS: ReadonlyMap<string, CommentThread> = new Map();
const NO_PEOPLE: ReadonlyMap<string, AvatarIdentity> = new Map();

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
  const authors = useMemo(() => {
    const ids = new Set<string>(others);
    for (const thread of threads.values())
      for (const entry of thread.entries) ids.add(entry.author);
    return [...ids].filter((id) => !known.has(id));
  }, [threads, others, known]);
  const found = usePeople(identity, authors);
  return useMemo(() => {
    if (found.size === 0) return known;
    const people = new Map(known);
    for (const person of found.values())
      people.set(person.id, { name: person.name, src: person.avatarUrl });
    return people;
  }, [known, found]);
}

/** Lists a document's threads from the host's store and keeps them as the reader changes them. */
export function useCommentThreads({
  store,
  documentId,
  identity,
  failed,
}: CommentThreadsOptions): CommentThreads {
  const { threads, error, write, settle } = useThreadList(store, { documentId, failed });
  const { activity, track } = useThreadActivity(store, { documentId, threads, failed });
  const people = useCommentPeople(identity, { threads, others: NO_AUTHORS, known: NO_PEOPLE });
  // Makes a change to a thread: noted before the store is asked, kept as the store returns it,
  // and shown as the thread's activity while it is made and when it fails.
  const change = useCallback<ThreadChange>(
    async (threadId, ask, tracked = {}) => {
      write(threadId);
      try {
        const asked = ask().then((result) => valueOf(result, failed));
        const thread = await track(threadId, tracked, asked);
        settle(threadId, thread);
        return thread;
      } catch (cause) {
        settle(threadId, undefined);
        throw cause;
      }
    },
    [write, settle, track, failed],
  );
  return useMemo(
    () => threadActions({ store, documentId, change }, { threads, people, error, activity }),
    [store, documentId, change, threads, people, error, activity],
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
