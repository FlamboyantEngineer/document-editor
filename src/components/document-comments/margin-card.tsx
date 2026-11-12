// A card of the comments margin, drawn again only when what it shows changes: typing beside
// hundreds of threads redraws the cards the caret moves between, not every card (DOCE-COMMENTS-3.7).

import { type CSSProperties, memo, useLayoutEffect, useMemo, useRef } from 'react';
import type { Suggestion } from '../../engine/index.js';
import { hooks } from './comment-cards.js';
import { type CardActions, type CommentItem, renderCommentCard } from './comment-items.js';

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

interface MarginCardProps {
  readonly item: CommentItem;
  /** How far the card moves across to sit beside its anchor's page. */
  readonly offset?: number | undefined;
  readonly actions: CardActions;
}

function isSameCard(previous: MarginCardProps, next: MarginCardProps): boolean {
  const [a, b] = [previous.actions, next.actions];
  return (
    previous.offset === next.offset &&
    a.isActive === b.isActive &&
    a.context === b.context &&
    a.canDecide === b.canDecide &&
    a.run === b.run &&
    a.startThread === b.startThread &&
    isSameItem(previous.item, next.item)
  );
}

/** A card beside its anchor's page, whatever the page's size and orientation. */
export const MarginCard = memo(function MarginCard({ item, offset = 0, actions }: MarginCardProps) {
  return (
    <div
      {...hooks.slot('card')}
      style={{ '--de-comment-offset': `${String(offset)}px` } as CSSProperties}
    >
      {renderCommentCard(item, actions)}
    </div>
  );
}, isSameCard);

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
