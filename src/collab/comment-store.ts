// A comment store kept in a shared room's `comments` type (decision D29), so threads reach every
// writer with the document and a commenter, who may write only that type, can keep them. Each
// thread, each comment and each reaction is its own attribute, so two people replying to or
// reacting in one thread at once both keep theirs.

import type * as Y from '@y/y';
import type { IdentityAdapter } from '../host/adapters.js';
import type {
  CommentEntry,
  CommentStoreAdapter,
  CommentThread,
  HostResult,
} from '../host/index.js';
import { keyOf, parseKey, plain, readRoomThreads } from './comment-records.js';

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

type ThreadFields = Omit<CommentThread, 'entries' | 'reactions'>;
type EntryFields = Omit<CommentEntry, 'reactions'>;

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
  found: (threadId: string) => HostResult<CommentThread>;
}

// The changes to a thread's own fields, each stamped: resolving, deciding and updating it.
function fieldChanges(room: Room): Pick<CommentStoreAdapter, 'setState' | 'decide' | 'update'> {
  const { type, write, me, stamp, found } = room;
  const setFields = (threadId: string, fields: Partial<ThreadFields>) => {
    const current = type.getAttr(keyOf(['thread', threadId])) as ThreadFields | undefined;
    if (!current) return Promise.resolve(missing<CommentThread>(threadId));
    write(() => {
      type.setAttr(
        keyOf(['thread', threadId]),
        plain({ ...current, ...fields, updatedAt: stamp() }),
      );
    });
    return Promise.resolve(found(threadId));
  };
  const resolution = (state: CommentThread['state']) =>
    state === 'resolved'
      ? { state, resolvedBy: me(), resolvedAt: stamp() }
      : { state, resolvedBy: undefined, resolvedAt: undefined };
  return {
    setState: (_documentId, threadId, state) => setFields(threadId, resolution(state)),
    decide: (_documentId, { threadId, ...decision }) =>
      setFields(threadId, {
        ...resolution('resolved'),
        decision: plain({ ...decision, by: me(), at: stamp() }),
      }),
    update: (_documentId, threadId, fields) => setFields(threadId, fields),
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
  const read = (threadId: string) => readRoomThreads(type).find((each) => each.id === threadId);
  const fieldsOf = (threadId: string) =>
    type.getAttr(keyOf(['thread', threadId])) as ThreadFields | undefined;
  const found = (threadId: string): HostResult<CommentThread> => {
    const thread = read(threadId);
    return thread ? { ok: true, value: thread } : missing(threadId);
  };
  const room: Room = { type, write, me, stamp, found };
  const addEntry = (threadId: string, text: string) => {
    const entry: EntryFields = { id: createId(), author: me(), text, createdAt: stamp() };
    type.setAttr(keyOf(['entry', threadId, entry.id]), entry);
  };
  return {
    list: () => Promise.resolve({ ok: true, value: readRoomThreads(type) }),
    create: (_documentId, { text, suggestion = null, ...fields }) => {
      if (fieldsOf(fields.id)) return Promise.resolve({ ok: false, error: { kind: 'conflict' } });
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
      if (!fieldsOf(threadId)) return Promise.resolve(missing(threadId));
      write(() => addEntry(threadId, text));
      return Promise.resolve(found(threadId));
    },
    ...fieldChanges(room),
    remove: (_documentId, threadId) => {
      if (!fieldsOf(threadId)) return Promise.resolve(missing(threadId));
      write(() => {
        type.forEachAttr((_value: unknown, name: string | number) => {
          if (parseKey(String(name))?.[1] === threadId) type.deleteAttr(String(name));
        });
      });
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
  ): { key: string; entry: EntryFields } | { refused: HostResult<CommentThread> } => {
    const key = keyOf(['entry', threadId, entryId]);
    const entry = type.getAttr(key) as EntryFields | undefined;
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
