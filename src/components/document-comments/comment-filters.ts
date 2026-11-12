// Which threads and suggestions the margin and the comments panel show: the reader's audience, then
// the open ones, all of them, or the reader's own, which counts the threads that mention them.

import type { CommentTextSegment } from '@flamboyantengineer/ui-components/comment-composer';
import type { Suggestion } from '../../engine/index.js';
import type { CommentThread } from '../../host/index.js';

/** Which threads are shown: the open ones, all of them, or the reader's own. */
export type CommentsFilter = 'open' | 'all' | 'mine';

/** Whether the reader is among the people a thread is for. */
export type CommentsAudience = (thread: CommentThread, me: string) => boolean;

/** What decides which threads and suggestions show. */
export interface ThreadFilter {
  readonly filter: CommentsFilter;
  /** The reader's person id. */
  readonly me: string;
  readonly audience?: CommentsAudience | undefined;
  /** Splits a comment's text into text and mentions. */
  readonly parse: (text: string) => readonly CommentTextSegment[];
  /** Whether a mentioned group, or another target, includes the reader. */
  readonly includes?:
    ((target: { kind: string; id: string }, personId: string) => boolean) | undefined;
  /** A thread the reader was taken to, which shows whatever the filter keeps. */
  readonly revealed?: string | null | undefined;
}

/** Whether a thread's comments mention the reader, by name or through a group that includes them. */
function isMentioned(thread: CommentThread, { me, parse, includes }: ThreadFilter): boolean {
  return thread.entries.some((entry) =>
    parse(entry.text).some((segment) => {
      if (segment.kind !== 'mention') return false;
      const kind = segment.mentionKind ?? 'person';
      if (kind === 'person') return segment.id === me;
      return includes?.({ kind, id: segment.id }, me) ?? false;
    }),
  );
}

/** Whether a thread is the reader's: they wrote one of its comments, or one mentions them. */
export function isOwnThread(thread: CommentThread, filter: ThreadFilter): boolean {
  return thread.entries.some((entry) => entry.author === filter.me) || isMentioned(thread, filter);
}

/**
 * Whether a thread shows: one for the reader that the filter keeps. A resolved thread shows under
 * `all`, and under `mine` only where `resolved` lets it, as in the comments panel.
 */
export function isThreadShown(
  thread: CommentThread,
  filter: ThreadFilter,
  { resolved }: { resolved: boolean },
): boolean {
  if (filter.audience && !filter.audience(thread, filter.me)) return false;
  if (filter.filter === 'all' || thread.id === filter.revealed) return true;
  if (thread.state !== 'open' && (filter.filter === 'open' || !resolved)) return false;
  return filter.filter === 'open' || isOwnThread(thread, filter);
}

/** Whether a suggestion shows: always, but under `mine` only the reader's or one on their thread. */
export function isSuggestionShown(
  suggestion: Suggestion,
  thread: CommentThread | null,
  filter: ThreadFilter,
): boolean {
  if (filter.filter !== 'mine' || suggestion.author === filter.me) return true;
  return thread !== null && isOwnThread(thread, filter);
}
