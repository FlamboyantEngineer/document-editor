// What every card of the margin and of the panel reads, and what decides which threads show. Both
// are the same objects from one state of the document to the next, so a card that is drawn again
// only when what it shows changes is not drawn again as the reader types (DOCE-COMMENTS-3.7).

import { useMemo } from 'react';
import type { CardContext } from './comment-cards.js';
import type { ThreadFilter } from './comment-filters.js';
import { type OpenedComment, useCommentFocus } from './comment-focus.js';
import { useCommentMentions } from './comment-mentions.js';
import type { DocumentCommentsOptions } from './document-comments.js';

/** What decides which threads show, whichever of them a filter then keeps. */
export type ListedThreads = Omit<ThreadFilter, 'filter'>;

type CardOptions = Pick<
  DocumentCommentsOptions,
  | 'identity'
  | 'documentId'
  | 'mentions'
  | 'audience'
  | 'format'
  | 'mentionCard'
  | 'commentActions'
  | 'threadPermissions'
>;

/**
 * The context the cards read, with mentions of the people the host's identity finds, and what
 * decides which threads and suggestions show; `shared.labels` is the same object while the labels
 * are.
 */
export function useCardContext(
  props: CardOptions,
  shared: Pick<CardContext, 'comments' | 'canComment' | 'labels' | 'scope'>,
): { context: CardContext; listed: ListedThreads; opened: OpenedComment | null } {
  const mentions = useCommentMentions(props.identity, props.mentions);
  const me = props.identity.currentPerson().id;
  const { documentId, format, mentionCard, audience, commentActions, threadPermissions } = props;
  const host = props.mentions;
  const { opened, newText } = useCommentFocus();
  const revealed = opened?.threadId;
  const listed = useMemo<ListedThreads>(
    () => ({ me, audience, parse: mentions.parse, includes: host?.includes?.bind(host), revealed }),
    [me, audience, mentions, host, revealed],
  );
  const { comments, canComment, labels, scope } = shared;
  const context = useMemo<CardContext>(
    () => ({
      comments,
      canComment,
      labels,
      mentions,
      format,
      mentionCard,
      commentActions,
      threadPermissions,
      documentId,
      me,
      scope,
      opened,
      newText,
    }),
    [
      comments,
      canComment,
      labels,
      mentions,
      format,
      mentionCard,
      commentActions,
      threadPermissions,
      documentId,
      me,
      scope,
      opened,
      newText,
    ],
  );
  return { context, listed, opened };
}
