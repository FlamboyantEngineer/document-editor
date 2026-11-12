// The rows a thread's card shows for what is happening in the thread besides its comments.

import type { CommentThreadActivity } from '@flamboyantengineer/ui-components/comment-thread';
import type { DocumentCommentsLabels } from './comments-labels.js';
import type { CommentThreads } from './use-comment-threads.js';
import type { ThreadActivity } from './use-thread-activity.js';

/** A thread's activity as the rows of its card: what each says, and its Cancel and Retry. */
export function activityRows(
  activity: readonly ThreadActivity[] | undefined,
  {
    comments,
    labels,
  }: { comments: Pick<CommentThreads, 'people'>; labels: DocumentCommentsLabels },
): CommentThreadActivity[] | undefined {
  if (!activity?.length) return undefined;
  const name = (person: string | undefined) =>
    (person && comments.people.get(person)?.name) ?? labels.someone;
  return activity.map(({ key, kind, person, message, onCancel, onRetry }) => {
    const label =
      kind === 'typing'
        ? labels.typing(name(person))
        : kind === 'pending'
          ? person
            ? labels.replying(name(person))
            : labels.posting
          : (message ?? labels.failed);
    return { key, kind, label, onCancel, onRetry };
  });
}
