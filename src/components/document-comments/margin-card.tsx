// A card of the comments margin, drawn again only when what it shows changes: typing beside
// hundreds of threads redraws the cards the caret moves between, not every card
// (DOCE-COMMENTS-3.7). The panel's cards are compared the same way.

import { type CSSProperties, memo, useLayoutEffect, useMemo, useRef } from 'react';
import type { Suggestion, SuggestionPolicy } from '../../engine/index.js';
import type { CommentThread } from '../../host/index.js';
import { useFocusHandOver } from './card-focus.js';
import { hooks } from './comment-cards.js';
import { type CardActions, type CommentItem, renderCommentCard } from './comment-items.js';
import { cardElementId, focusReplyOnPress } from './use-open-cards.js';

// Whether a suggestion reads the same on its card, wherever the document now has it.
function isSameSuggestion(a: Suggestion, b: Suggestion): boolean {
  return (
    a.id === b.id &&
    a.author === b.author &&
    a.thread === b.thread &&
    a.inserted === b.inserted &&
    a.deleted === b.deleted
  );
}

// Whether two items show the same card: the positions of their text aside.
function isSameItem(a: CommentItem, b: CommentItem): boolean {
  if (a.key !== b.key) return false;
  switch (a.kind) {
    case 'thread':
      return b.kind === 'thread' && a.thread === b.thread;
    case 'pending':
      return b.kind === 'pending' && a.id === b.id && a.quote === b.quote;
    case 'suggestion':
      return (
        b.kind === 'suggestion' &&
        a.thread === b.thread &&
        isSameSuggestion(a.suggestion, b.suggestion)
      );
    case 'draft':
      return b.kind === 'draft';
  }
}

/** A card as the margin and the panel draw one: its item and what it does. */
export interface ShownCard {
  readonly item: CommentItem;
  readonly actions: CardActions;
}

/** Whether two cards show the same, wherever the document now has their text. */
export function isSameCardShown(previous: ShownCard, next: ShownCard): boolean {
  const [a, b] = [previous.actions, next.actions];
  return (
    a.isActive === b.isActive &&
    a.context === b.context &&
    a.policy === b.policy &&
    a.run === b.run &&
    a.startThread === b.startThread &&
    isSameItem(previous.item, next.item)
  );
}

interface MarginCardProps extends ShownCard {
  /** How far the card moves across to sit beside its anchor's page. */
  readonly offset?: number | undefined;
}

const isSameCard = (previous: MarginCardProps, next: MarginCardProps) =>
  previous.offset === next.offset && isSameCardShown(previous, next);

/** A card beside its anchor's page, whatever the page's size and orientation. */
export const MarginCard = memo(function MarginCard({ item, offset = 0, actions }: MarginCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusHandOver(ref);
  return (
    <div
      ref={ref}
      id={cardElementId(item.key)}
      // Focused when its card opens from its text or a link; a press on the card itself, not one
      // of its controls, focuses its reply box.
      tabIndex={-1}
      onClick={focusReplyOnPress}
      {...hooks.slot('card')}
      style={{ '--de-comment-offset': `${String(offset)}px` } as CSSProperties}
    >
      {renderCommentCard(item, actions)}
    </div>
  );
}, isSameCard);

/**
 * The policy the suggestion cards decide by, its unattributed suggestions their thread's writer's
 * (DOCE-SUGGESTIONS-2.5): a new one only when what it says or the threads change, the editor
 * building a new one on each render, so the suggestion cards are drawn again only then.
 */
export function useCardPolicy(
  { me, canDecide, canWithdraw, decide }: SuggestionPolicy,
  threads: ReadonlyMap<string, CommentThread>,
): SuggestionPolicy {
  return useMemo(
    () => ({
      me,
      canDecide,
      canWithdraw,
      decide,
      threadAuthor: (thread: string) => threads.get(thread)?.entries[0]?.author,
    }),
    [me, canDecide, canWithdraw, decide, threads],
  );
}

type CardCallbacks = Pick<CardActions, 'run' | 'startThread'>;

/**
 * The cards' commands, the same functions from one render to the next, each calling the latest
 * one given, so a new document state redraws no card.
 */
export function useStableCallbacks(callbacks: CardCallbacks): CardCallbacks {
  const latest = useRef(callbacks);
  useLayoutEffect(() => {
    latest.current = callbacks;
  });
  return useMemo(
    () => ({
      run: (command) => latest.current.run(command),
      startThread: () => latest.current.startThread(),
    }),
    [],
  );
}
