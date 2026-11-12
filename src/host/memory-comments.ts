// An in-memory comment store: each document's threads, attributed to the reader, kept for the
// page session, with every change told to the document's subscribers.

import type { HostResult, IdentityAdapter } from './adapters.js';
import type { CommentEntry, CommentStoreAdapter, CommentThread } from './comment-adapters.js';

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

const denied: HostResult<CommentThread> = { ok: false, error: { kind: 'denied' } };

// Changes a document's thread, unless the change refuses; tells the subscribers.
type Change = (
  documentId: string,
  threadId: string,
  apply: (thread: CommentThread) => HostResult<CommentThread> | null,
) => Promise<HostResult<CommentThread>>;

// The changes to a thread as a whole: opening and resolving it, deciding its suggestion, and
// changing what it is about.
function threadChanges(
  change: Change,
  { me, now }: { me: () => string; now: () => Date },
): Pick<CommentStoreAdapter, 'setState' | 'decide' | 'update'> {
  // Opens or resolves a thread, stamping who resolved it and when.
  const resolve = (thread: CommentThread, state: CommentThread['state']) => {
    thread.state = state;
    thread.resolvedBy = state === 'resolved' ? me() : undefined;
    thread.resolvedAt = state === 'resolved' ? now().toISOString() : undefined;
  };
  return {
    setState: (documentId, threadId, state) =>
      change(documentId, threadId, (thread) => {
        resolve(thread, state);
        return null;
      }),
    decide: (documentId, { threadId, ...decision }) =>
      change(documentId, threadId, (thread) => {
        thread.decision = { ...decision, by: me(), at: now().toISOString() };
        resolve(thread, 'resolved');
        return null;
      }),
    update: (documentId, threadId, fields) =>
      change(documentId, threadId, (thread) => {
        Object.assign(thread, fields);
        return null;
      }),
  };
}

// The changes to one comment of a thread: editing and deleting the reader's own, and reacting.
function entryChanges(
  change: Change,
  { me, now }: { me: () => string; now: () => Date },
): Pick<CommentStoreAdapter, 'edit' | 'removeEntry' | 'react'> {
  // The reader's own comment, or why the reader may not change it.
  const own = (thread: CommentThread, entryId: string) => {
    const found = thread.entries.find((each) => each.id === entryId);
    if (!found) return { refused: missing<CommentThread>(entryId) };
    return found.author === me() ? { found } : { refused: denied };
  };
  return {
    edit: (documentId, { threadId, entryId, text }) =>
      change(documentId, threadId, (thread) => {
        const { found, refused } = own(thread, entryId);
        if (!found) return refused;
        found.text = text;
        found.editedAt = now().toISOString();
        return null;
      }),
    removeEntry: (documentId, { threadId, entryId }) =>
      change(documentId, threadId, (thread) => {
        const { found, refused } = own(thread, entryId);
        if (!found) return refused;
        thread.entries = thread.entries.filter((each) => each !== found);
        return null;
      }),
    react: (documentId, { threadId, entryId, emoji, reacted }) =>
      change(documentId, threadId, (thread) => {
        const found = entryId === undefined ? thread : thread.entries.find((e) => e.id === entryId);
        if (!found) return missing(entryId ?? threadId);
        const reactions = { ...found.reactions };
        const people = (reactions[emoji] ?? []).filter((person) => person !== me());
        if (reacted) people.push(me());
        if (people.length) reactions[emoji] = people;
        else delete reactions[emoji];
        found.reactions = reactions;
        return null;
      }),
  };
}

/**
 * A comment store that keeps threads in memory, attributing comments to the reader, and tells each
 * subscriber of a document about every change to its threads.
 */
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
  const listeners = new Map<string, Set<(threads: CommentThread[]) => void>>();
  const me = () => identity.currentPerson().id;
  let entries = 0;
  const entry = (text: string): CommentEntry => {
    entries += 1;
    return { id: `comment-${String(entries)}`, author: me(), text, createdAt: now().toISOString() };
  };
  const threadsOf = (documentId: string) => {
    const existing = stored.get(documentId) ?? new Map<string, CommentThread>();
    stored.set(documentId, existing);
    return existing;
  };
  const notify = (documentId: string) => {
    const list = [...threadsOf(documentId).values()];
    for (const listener of listeners.get(documentId) ?? []) listener(structuredClone(list));
  };
  const change: Change = (documentId, threadId, apply) => {
    const thread = threadsOf(documentId).get(threadId);
    if (!thread) return Promise.resolve(missing(threadId));
    const refused = apply(thread);
    if (refused) return Promise.resolve(refused);
    thread.updatedAt = now().toISOString();
    notify(documentId);
    return Promise.resolve({ ok: true, value: structuredClone(thread) });
  };
  return {
    list: (documentId) =>
      Promise.resolve({ ok: true, value: structuredClone([...threadsOf(documentId).values()]) }),
    create: (documentId, { text, suggestion = null, ...fields }) => {
      const list = threadsOf(documentId);
      if (list.has(fields.id)) return Promise.resolve({ ok: false, error: { kind: 'conflict' } });
      const at = now().toISOString();
      const thread: CommentThread = {
        ...fields,
        state: 'open',
        suggestion,
        entries: text ? [entry(text)] : [],
        author: me(),
        createdAt: at,
        updatedAt: at,
      };
      list.set(fields.id, thread);
      notify(documentId);
      return Promise.resolve({ ok: true, value: structuredClone(thread) });
    },
    reply: (documentId, threadId, text) =>
      change(documentId, threadId, (thread) => {
        thread.entries.push(entry(text));
        return null;
      }),
    remove: (documentId, threadId) => {
      if (!threadsOf(documentId).delete(threadId)) return Promise.resolve(missing(threadId));
      notify(documentId);
      return Promise.resolve({ ok: true, value: null });
    },
    ...threadChanges(change, { me, now }),
    ...entryChanges(change, { me, now }),
    subscribe: (documentId, onThreads) => {
      const set = listeners.get(documentId) ?? new Set();
      listeners.set(documentId, set);
      set.add(onThreads);
      return () => set.delete(onThreads);
    },
  };
}
