// The changes the reader makes to a document's threads, each asked of the host's store and kept as
// it returns the thread, while the store can make it.

import type {
  CommentDecision,
  CommentStoreAdapter,
  CommentThread,
  HostResult,
  NewCommentThread,
} from '../../host/index.js';
import type { CommentThreads } from './use-comment-threads.js';
import type { TrackedChange } from './use-thread-activity.js';

/** Makes a change to a thread and returns it as the store left it, `null` once it is removed. */
export type ThreadChange = (
  threadId: string,
  ask: () => Promise<HostResult<CommentThread | null>>,
  tracked?: TrackedChange,
) => Promise<CommentThread | null>;

/** A comment of a thread, by the thread's id and its own. */
export interface EntryChange {
  readonly threadId: string;
  readonly entryId: string;
}

/** How a thread's suggestion was decided, as the store records it. */
export type ThreadDecision = Pick<CommentDecision, 'decision' | 'suggestion' | 'dependsOn'> & {
  readonly threadId: string;
};

function present(thread: CommentThread | null): CommentThread {
  if (!thread) throw new Error('The store returned no thread.');
  return thread;
}

/** The threads with the changes the reader can make to them, through `change`. */
export function threadActions(
  {
    store,
    documentId,
    change,
  }: { store: CommentStoreAdapter; documentId: string; change: ThreadChange },
  state: Pick<CommentThreads, 'threads' | 'people' | 'error' | 'activity'>,
): CommentThreads {
  const { edit, removeEntry, react, decide, update, setTyping } = store;
  const reply = async (threadId: string, text: string): Promise<CommentThread | null> =>
    change(threadId, () => store.reply(documentId, threadId, text), {
      isPending: true,
      retry: () => void reply(threadId, text),
    }).catch(() => null);
  // Records a decision, offering Retry on the thread each time the store refuses it.
  function record(
    decision: ThreadDecision,
    ask: NonNullable<typeof decide>,
  ): Promise<CommentThread | null> {
    return change(decision.threadId, () => ask.call(store, documentId, decision), {
      retry: () => void record(decision, ask).catch(() => undefined),
    });
  }
  return {
    ...state,
    create: async (thread: NewCommentThread) =>
      present(await change(thread.id, () => store.create(documentId, thread))),
    reply,
    setState: async (threadId, next) =>
      present(await change(threadId, () => store.setState(documentId, threadId, next))),
    remove: async (threadId) => {
      await change(threadId, () => store.remove(documentId, threadId));
    },
    edit: edit
      ? async (entry) =>
          present(await change(entry.threadId, () => edit.call(store, documentId, entry)))
      : null,
    removeEntry: removeEntry
      ? async (entry) =>
          present(await change(entry.threadId, () => removeEntry.call(store, documentId, entry)))
      : null,
    react: react
      ? async (reaction) =>
          present(await change(reaction.threadId, () => react.call(store, documentId, reaction)))
      : null,
    decide: decide ? async (decision) => present(await record(decision, decide)) : null,
    update: update
      ? async (threadId, fields) =>
          present(await change(threadId, () => update.call(store, documentId, threadId, fields)))
      : null,
    setTyping: setTyping
      ? (threadId, isTyping) => setTyping.call(store, documentId, threadId, isTyping)
      : null,
  };
}
