// A room's comment threads for a host's store: the threads a room holds, and stored threads
// written into a room that holds none yet, each with its authors, dates, comments, reactions and
// deletions as they were, so a room seeded again from storage shows what the store kept.

import type * as Y from '@y/y';
import type { CommentEntry, CommentThread } from '../host/index.js';
import { keyOf, plain, readRoomThreads } from './comment-records.js';
import { resolveRoomScope, type RoomScope } from './room-scope.js';

/** Where a room's threads are: the shared handles of an embedded document field. */
export interface RoomCommentsOptions {
  scope?: RoomScope | undefined;
}

/** Every thread a room holds, as the room's comment store lists them, comments oldest first. */
export function readRoomComments(doc: Y.Doc, options: RoomCommentsOptions = {}): CommentThread[] {
  return readRoomThreads(resolveRoomScope(doc, options.scope).comments);
}

// The reactions a thread or comment has, each person's as a record of its own.
function writeReactions(
  type: Y.Type,
  {
    threadId,
    entryId,
    reactions,
  }: { threadId: string; entryId: string; reactions?: Record<string, string[]> | undefined },
): void {
  for (const [emoji, people] of Object.entries(reactions ?? {})) {
    for (const person of people)
      type.setAttr(keyOf(['reaction', threadId, entryId, emoji, person]), true);
  }
}

function writeEntry(type: Y.Type, threadId: string, entry: CommentEntry): void {
  const { reactions, ...record } = entry;
  type.setAttr(keyOf(['entry', threadId, entry.id]), plain(record));
  writeReactions(type, { threadId, entryId: entry.id, reactions });
}

function writeThread(type: Y.Type, thread: CommentThread): void {
  const { entries, reactions, deletedBy, deletedAt, state, ...fields } = thread;
  // A deleted thread keeps the state it had before; its removal is a record of its own.
  const kept = state === 'resolved' ? 'resolved' : 'open';
  type.setAttr(keyOf(['thread', thread.id]), plain({ ...fields, state: kept }));
  for (const entry of entries) writeEntry(type, thread.id, entry);
  writeReactions(type, { threadId: thread.id, entryId: '', reactions });
  if (state === 'deleted')
    type.setAttr(keyOf(['removed', thread.id]), plain({ by: deletedBy, at: deletedAt }));
}

/**
 * Writes stored threads into a room that holds none yet, in one transaction, as the room's comment
 * store reads them back: who started each and when, its state, comments, reactions and deletion.
 * Throws, and writes nothing, when the room holds threads already.
 */
export function writeRoomComments(
  doc: Y.Doc,
  threads: readonly CommentThread[],
  options: RoomCommentsOptions = {},
): void {
  const type = resolveRoomScope(doc, options.scope).comments;
  let held = false;
  type.forEachAttr(() => {
    held = true;
  });
  if (held) throw new Error('The room already holds comment threads.');
  doc.transact(() => {
    for (const thread of threads) writeThread(type, thread);
  });
}
