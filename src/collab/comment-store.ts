// A comment store kept in a shared room's `comments` type (decision D29), so threads reach every
// writer with the document and a commenter, who may write only that type, can keep them. Each
// thread, each field of it that changes, each comment and each reaction is its own attribute, so
// two people changing one thread at once both keep what they did (`comment-records.ts`).

import type * as Y from '@y/y';
import type { IdentityAdapter } from '../host/adapters.js';
import type {
  CommentEntry,
  CommentStoreAdapter,
  CommentThread,
  HostResult,
} from '../host/index.js';
import {
  entryOf,
  keyOf,
  parseKey,
  plain,
  readRoomThreads,
  type ThreadFieldKind,
} from './comment-records.js';

/** The room's shared document and how the store tells time and makes ids. */
export interface RoomCommentStoreOptions {
  /** The shared document, such as a room provider's; the threads are its `comments` type. */
  doc: Y.Doc;
  identity: IdentityAdapter;
  /** The time a change is made at. Defaults to now. */
  now?: (() => Date) | undefined;
  /** A new comment's id. Defaults to a random one. */
  createId?: (() => string) | undefined;
}

const COMMENTS = 'comments';

function missing<T>(id: string): HostResult<T> {
  return { ok: false, error: { kind: 'not-found', message: `No thread with id ${id}.` } };
}

const denied: HostResult<CommentThread> = { ok: false, error: { kind: 'denied' } };

/** What the store's changes act through: the type, the writer, the reader and the time. */
interface Room {
  type: Y.Type;
  write: (change: () => void) => void;
  me: () => string;
  stamp: () => string;
  /** Whether the type holds the thread, and it was not removed. */
  has: (threadId: string) => boolean;
  found: (threadId: string) => HostResult<CommentThread>;
}

// The changes to a thread's own fields: resolving, deciding and updating it. Each field is
// written apart from the thread's record, with when it was set, so that two writers changing
// different fields at once, or one changing a field while another removes the thread, undo nothing.
function fieldChanges(room: Room): Pick<CommentStoreAdapter, 'setState' | 'decide' | 'update'> {
  const { type, write, me, stamp, has, found } = room;
  const set = (threadId: string, kind: ThreadFieldKind, record: object) =>
    type.setAttr(keyOf([kind, threadId]), plain(record));
  const change = (threadId: string, make: () => void) => {
    if (!has(threadId)) return Promise.resolve(missing<CommentThread>(threadId));
    write(make);
    return Promise.resolve(found(threadId));
  };
  const setState = (threadId: string, state: CommentThread['state']) =>
    set(threadId, 'state', { state, by: me(), at: stamp() });
  return {
    setState: (_documentId, threadId, state) => change(threadId, () => setState(threadId, state)),
    decide: (_documentId, { threadId, ...decision }) =>
      change(threadId, () => {
        setState(threadId, 'resolved');
        set(threadId, 'decision', { ...decision, by: me(), at: stamp() });
      }),
    update: (_documentId, threadId, fields) =>
      change(threadId, () => {
        for (const kind of ['quote', 'target', 'change'] as const) {
          if (fields[kind] !== undefined) set(threadId, kind, { value: fields[kind], at: stamp() });
        }
      }),
  };
}

/**
 * A comment store over a shared room's `comments` type: every writer's threads, attributed to the
 * reader, told to each subscriber as they change, by anyone. The room is the document, so the
 * document id the editor passes is not needed.
 */
export function createRoomCommentStore({
  doc,
  identity,
  now = () => new Date(),
  createId = () => crypto.randomUUID(),
}: RoomCommentStoreOptions): CommentStoreAdapter {
  const type = doc.get(COMMENTS);
  const origin = { roomComments: true };
  const me = () => identity.currentPerson().id;
  const stamp = () => now().toISOString();
  const write = (change: () => void) => doc.transact(change, origin);
  const held = (kind: 'thread' | 'removed', threadId: string) =>
    type.getAttr(keyOf([kind, threadId])) !== undefined;
  const has = (threadId: string) => held('thread', threadId) && !held('removed', threadId);
  const found = (threadId: string): HostResult<CommentThread> => {
    const thread = readRoomThreads(type).find((each) => each.id === threadId);
    return thread ? { ok: true, value: thread } : missing(threadId);
  };
  const room: Room = { type, write, me, stamp, has, found };
  const addEntry = (threadId: string, text: string) => {
    const id = createId();
    type.setAttr(keyOf(['entry', threadId, id]), { id, author: me(), text, createdAt: stamp() });
  };
  return {
    list: () => Promise.resolve({ ok: true, value: readRoomThreads(type) }),
    create: (_documentId, { text, suggestion = null, ...fields }) => {
      // A removed thread's id is not taken again: its mark would hide the new thread.
      if (held('thread', fields.id) || held('removed', fields.id))
        return Promise.resolve({ ok: false, error: { kind: 'conflict' } });
      const at = stamp();
      write(() => {
        type.setAttr(
          keyOf(['thread', fields.id]),
          plain({
            ...fields,
            suggestion,
            state: 'open' as const,
            author: me(),
            createdAt: at,
            updatedAt: at,
          }),
        );
        if (text) addEntry(fields.id, text);
      });
      return Promise.resolve(found(fields.id));
    },
    reply: (_documentId, threadId, text) => {
      if (!has(threadId)) return Promise.resolve(missing(threadId));
      write(() => addEntry(threadId, text));
      return Promise.resolve(found(threadId));
    },
    ...fieldChanges(room),
    remove: (_documentId, threadId) => {
      if (!has(threadId)) return Promise.resolve(missing(threadId));
      write(() => removeThread(type, threadId));
      return Promise.resolve({ ok: true, value: null });
    },
    ...entryChanges(room),
    subscribe: (_documentId, onThreads) => {
      const tell = () => onThreads(readRoomThreads(type));
      type.observe(tell);
      return () => type.unobserve(tell);
    },
  };
}

// Removes a thread's records and marks the thread removed. The mark stays: a change another
// writer makes to the thread at the same time, or an older editor writing its record again, would
// otherwise bring back a thread with nothing in it.
function removeThread(type: Y.Type, threadId: string): void {
  const names: string[] = [];
  type.forEachAttr((_value: unknown, name: string | number) => {
    if (parseKey(String(name))?.[1] === threadId) names.push(String(name));
  });
  for (const name of names) type.deleteAttr(name);
  type.setAttr(keyOf(['removed', threadId]), true);
}

// The changes to one comment: editing and deleting the reader's own, and reacting to a comment or,
// without one, to the thread.
function entryChanges({
  type,
  write,
  me,
  stamp,
  found,
}: Room): Pick<CommentStoreAdapter, 'edit' | 'removeEntry' | 'react'> {
  // The reader's own comment, or why they may not change it.
  const own = (
    threadId: string,
    entryId: string,
  ): { key: string; entry: CommentEntry } | { refused: HostResult<CommentThread> } => {
    const key = keyOf(['entry', threadId, entryId]);
    const entry = entryOf(entryId, type.getAttr(key));
    if (!entry) return { refused: missing<CommentThread>(entryId) };
    return entry.author === me() ? { key, entry } : { refused: denied };
  };
  return {
    edit: (_documentId, { threadId, entryId, text }) => {
      const mine = own(threadId, entryId);
      if ('refused' in mine) return Promise.resolve(mine.refused);
      write(() => type.setAttr(mine.key, { ...mine.entry, text, editedAt: stamp() }));
      return Promise.resolve(found(threadId));
    },
    removeEntry: (_documentId, { threadId, entryId }) => {
      const mine = own(threadId, entryId);
      if ('refused' in mine) return Promise.resolve(mine.refused);
      write(() => type.deleteAttr(mine.key));
      return Promise.resolve(found(threadId));
    },
    react: (_documentId, { threadId, entryId = '', emoji, reacted }) => {
      const thread = found(threadId);
      if (!thread.ok) return Promise.resolve(thread);
      const key = keyOf(['reaction', threadId, entryId, emoji, me()]);
      write(() => (reacted ? type.setAttr(key, true) : type.deleteAttr(key)));
      return Promise.resolve(found(threadId));
    },
  };
}
