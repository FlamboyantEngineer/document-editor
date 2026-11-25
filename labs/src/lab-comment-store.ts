// The comments lab's store: the in-memory host's, with what a host's backend adds to it. An
// assistant writes replies for the reader, which stay pending until the lab finishes them or fails
// them, for the reader to retry or for good; other people write in a thread; and the store hears
// when the reader writes in one.

import type {
  CommentActivity,
  CommentEntry,
  CommentStoreAdapter,
  CommentThread,
  HostResult,
} from '../../src/host/index.js';

/** How the assistant's reply being written ends. */
export type AnswerOutcome = 'answer' | 'retryable' | 'final';

/** The lab store, and the controls a host's backend would drive. */
export interface LabCommentStore extends CommentStoreAdapter {
  /** Starts a reply the assistant writes for the reader in a thread, pending until settled. */
  ask(documentId: string, threadId: string): void;
  /** Ends the assistant's latest pending reply: written, or failed, to retry or for good. */
  settle(documentId: string, outcome: AnswerOutcome): void;
  /** Says who else is writing in which thread. */
  setOthersTyping(documentId: string, activity: readonly CommentActivity[]): void;
}

const ANSWER = 'From its detection: the clock starts once the fault is seen.';
const FAILED = 'The assistant could not answer.';

const missing = (id: string): HostResult<CommentThread> => ({
  ok: false,
  error: { kind: 'not-found', message: `No reply with id ${id}.` },
});

// The assistant's replies of each document, by thread, over the inner store's threads.
type Answers = Map<string, Map<string, CommentEntry[]>>;

function withAnswers(answers: Answers, documentId: string, thread: CommentThread): CommentThread {
  const extra = answers.get(documentId)?.get(thread.id);
  return extra?.length ? { ...thread, entries: [...thread.entries, ...extra] } : thread;
}

/**
 * Wraps a comment store with an assistant's replies written for the reader and other people's
 * typing, as a host's backend would tell of them; `onTyping` hears the reader writing.
 */
export function createLabCommentStore(
  inner: CommentStoreAdapter,
  onTyping: (threadId: string, isTyping: boolean) => void,
): LabCommentStore {
  const answers: Answers = new Map();
  const latest = new Map<string, CommentThread[]>();
  const listeners = new Map<string, Set<(threads: CommentThread[]) => void>>();
  const typing = new Map<string, readonly CommentActivity[]>();
  const typingListeners = new Map<string, Set<(activity: CommentActivity[]) => void>>();
  let asked = 0;
  const answersOf = (documentId: string) => {
    const found = answers.get(documentId) ?? new Map<string, CommentEntry[]>();
    answers.set(documentId, found);
    return found;
  };
  const merged = (documentId: string) =>
    (latest.get(documentId) ?? []).map((thread) => withAnswers(answers, documentId, thread));
  const notify = (documentId: string) => {
    for (const listener of listeners.get(documentId) ?? []) listener(merged(documentId));
  };
  // A thread the inner store returned, with the assistant's replies in it.
  const shown = async (documentId: string, result: Promise<HostResult<CommentThread>>) => {
    const answer = await result;
    return answer.ok
      ? { ok: true as const, value: withAnswers(answers, documentId, answer.value) }
      : answer;
  };
  const changeAnswer = (
    documentId: string,
    threadId: string,
    change: (list: CommentEntry[]) => CommentEntry[],
  ) => {
    const list = answersOf(documentId);
    list.set(threadId, change(list.get(threadId) ?? []));
    notify(documentId);
  };
  return {
    ...inner,
    list: async (documentId, signal) => {
      const result = await inner.list(documentId, signal);
      if (!result.ok) return result;
      latest.set(documentId, result.value);
      return { ok: true, value: merged(documentId) };
    },
    create: (documentId, thread) => shown(documentId, inner.create(documentId, thread)),
    reply: (documentId, reply) => shown(documentId, inner.reply(documentId, reply)),
    setState: (documentId, threadId, state) =>
      shown(documentId, inner.setState(documentId, threadId, state)),
    subscribe: (documentId, onThreads) => {
      const set = listeners.get(documentId) ?? new Set();
      listeners.set(documentId, set);
      set.add(onThreads);
      const stop = inner.subscribe?.(documentId, (threads) => {
        latest.set(documentId, threads);
        onThreads(merged(documentId));
      });
      return () => {
        set.delete(onThreads);
        stop?.();
      };
    },
    settleEntry: (documentId, { threadId, entryId, action }) => {
      const thread = latest.get(documentId)?.find((each) => each.id === threadId);
      const found = answersOf(documentId)
        .get(threadId)
        ?.some((entry) => entry.id === entryId);
      if (!thread || !found) return Promise.resolve(missing(entryId));
      changeAnswer(documentId, threadId, (list) =>
        action === 'cancel'
          ? list.filter((entry) => entry.id !== entryId)
          : list.map((entry) =>
              entry.id === entryId
                ? { ...entry, status: 'pending', text: '', retryable: undefined }
                : entry,
            ),
      );
      return Promise.resolve({ ok: true, value: withAnswers(answers, documentId, thread) });
    },
    setTyping: (documentId, threadId, isTyping) => {
      inner.setTyping?.(documentId, threadId, isTyping);
      onTyping(threadId, isTyping);
    },
    subscribeActivity: (documentId, onActivity) => {
      const set = typingListeners.get(documentId) ?? new Set();
      typingListeners.set(documentId, set);
      set.add(onActivity);
      onActivity([...(typing.get(documentId) ?? [])]);
      return () => set.delete(onActivity);
    },
    ask: (documentId, threadId) => {
      asked += 1;
      const entry: CommentEntry = {
        id: `answer-${String(asked)}`,
        author: 'helper',
        agent: 'helper',
        text: '',
        createdAt: new Date().toISOString(),
        status: 'pending',
      };
      changeAnswer(documentId, threadId, (list) => [...list, entry]);
    },
    settle: (documentId, outcome) => {
      for (const [threadId, list] of answersOf(documentId)) {
        const pending = list.findLast((entry) => entry.status === 'pending');
        if (!pending) continue;
        const settled: CommentEntry =
          outcome === 'answer'
            ? { ...pending, status: undefined, text: ANSWER }
            : {
                ...pending,
                status: 'failed',
                text: FAILED,
                retryable: outcome === 'final' ? false : undefined,
              };
        changeAnswer(documentId, threadId, (entries) =>
          entries.map((entry) => (entry.id === pending.id ? settled : entry)),
        );
        return;
      }
    },
    setOthersTyping: (documentId, activity) => {
      typing.set(documentId, activity);
      for (const listener of typingListeners.get(documentId) ?? []) listener([...activity]);
    },
  };
}
