// What the reader may do in a thread: by default, whatever commenting allows, with their own
// comments; a host's policy may take any of it away for a thread, never grant more.

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
): ThreadPermissions & { own: (entry: CommentEntry) => boolean } {
  const host = canComment ? (threadPermissions?.(thread, me) ?? {}) : {};
  const allows = (what: keyof ThreadPermissions) => canComment && host[what] !== false;
  return {
    reply: allows('reply'),
    resolve: allows('resolve'),
    react: allows('react'),
    edit: allows('edit'),
    remove: allows('remove'),
    own: (entry) => entry.author === me,
  };
}
