// What the reader may do in a thread: by default, whatever commenting allows, with their own
// comments; a host's policy may take any of it away for a thread, and grant only moderation.

import { mayChangeComment } from '../../host/comment-rules.js';
import type { CommentEntry, CommentThread } from '../../host/index.js';

/** What the reader may do in one thread. */
export interface ThreadPermissions {
  /** Post a reply. */
  readonly reply: boolean;
  /** Resolve or reopen the thread. */
  readonly resolve: boolean;
  /** React to the thread or its comments. */
  readonly react: boolean;
  /** Edit their own comments. */
  readonly edit: boolean;
  /** Delete their own replies and, from its opening comment, their own thread. */
  readonly remove: boolean;
  /**
   * Edit and delete other people's comments and threads too, and any reply rather than only the
   * last; off unless the host's policy grants it.
   */
  readonly moderate: boolean;
}

/** A host's policy for each thread: what it allows the reader, of what commenting allows. */
export type ThreadPermissionPolicy = (
  thread: CommentThread,
  me: string,
) => Partial<ThreadPermissions>;

/** What the reader may do in a thread, and with one of its comments. */
export function resolveThreadPermissions(
  thread: CommentThread,
  {
    me,
    canComment,
    threadPermissions,
  }: { me: string; canComment: boolean; threadPermissions?: ThreadPermissionPolicy | undefined },
): ThreadPermissions & { mayChange: (entry: CommentEntry) => boolean } {
  const host = canComment ? (threadPermissions?.(thread, me) ?? {}) : {};
  const allows = (what: keyof ThreadPermissions) => canComment && host[what] !== false;
  const moderates = canComment && host.moderate === true;
  return {
    reply: allows('reply'),
    resolve: allows('resolve'),
    react: allows('react'),
    edit: allows('edit'),
    remove: allows('remove'),
    moderate: moderates,
    // Their own comment, and a reply only while it is the last; any comment for a moderator.
    mayChange: (entry) => mayChangeComment(thread, entry, { me, moderates }),
  };
}
