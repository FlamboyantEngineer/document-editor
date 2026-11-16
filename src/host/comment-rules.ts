// Who may change a comment of a thread: its author, or a moderator, and a reply only while it is
// the last one left in an open thread. The cards, the in-memory store and the room store share it.

import type { CommentEntry, CommentThread } from './comment-adapters.js';

/** What a comment's change needs: who the reader is, and whether they moderate the comments. */
interface CommentChanger {
  readonly me: string;
  /** Changes and deletes other people's comments too, and replies anywhere in a thread. */
  readonly moderates?: boolean | undefined;
}

/** Whether a comment is still there: not a deleted reply the store keeps as a record. */
const isLiveEntry = (entry: CommentEntry) => entry.deletedAt === undefined;

/**
 * Whether the reader may edit or delete a comment of a thread: one of their own, and a reply only
 * while it is the last reply left and the thread is open; a moderator, any comment of a thread not
 * deleted.
 */
export function mayChangeComment(
  thread: CommentThread,
  entry: CommentEntry,
  { me, moderates = false }: CommentChanger,
): boolean {
  if (thread.state === 'deleted' || !isLiveEntry(entry)) return false;
  if (moderates) return true;
  if (entry.author !== me) return false;
  const live = thread.entries.filter(isLiveEntry);
  const opening = live[0]?.id === entry.id;
  return opening || (thread.state === 'open' && live.at(-1)?.id === entry.id);
}
