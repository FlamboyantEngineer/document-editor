// The cards of the comments panel, each drawn again only when what it shows changes. The panel is
// given every state of the document, also while its pane is hidden, so typing beside hundreds of
// threads must not draw every card again (DOCE-COMMENTS-3.7).

import { Button } from '@flamboyantengineer/ui-components/button';
import type { Key } from '@flamboyantengineer/ui-components/core';
import { memo, type ReactNode, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import type { CommentThread } from '../../host/index.js';
import type { AnchorTarget } from './anchor-rects.js';
import { useFocusHandOver } from './card-focus.js';
import { type CardContext, ThreadCard } from './comment-cards.js';
import { renderCommentCard } from './comment-items.js';
import { hooks } from './comments-panel-hooks.js';
import { isSameCardShown, type ShownCard } from './margin-card.js';
import { focusReplyOnPress } from './use-open-cards.js';

// Whether an element took focus from the keyboard, rather than a pointer press.
function isFocusVisible(element: Element): boolean {
  try {
    return element.matches(':focus-visible');
  } catch {
    return false;
  }
}

// An item of the panel's list, scrolled into view within the panel when it becomes the active one;
// it can take focus, as the card after one that goes does.
function PanelItem({
  isActive,
  slot,
  onSelect,
  children,
}: {
  isActive: boolean;
  slot: ReturnType<typeof hooks.slot>;
  /** Makes the card the active one, as a press on it or focus in it does. */
  onSelect: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusHandOver(ref);
  useEffect(() => {
    if (isActive) ref.current?.scrollIntoView?.({ block: 'nearest' });
  }, [isActive]);
  return (
    <div
      ref={ref}
      role="listitem"
      tabIndex={-1}
      // A click selects the card, which shows its reply box, then a click on the card itself, not
      // one of its controls, focuses the box. Selecting on the press would move the controls below
      // the box before the click lands.
      onClick={(event) => {
        const { currentTarget, target } = event;
        flushSync(onSelect);
        focusReplyOnPress({ currentTarget, target });
      }}
      // Keyboard focus moving into the card selects it too.
      onFocus={(event) => {
        if (isFocusVisible(event.target)) onSelect();
      }}
      {...slot}
    >
      {children}
    </div>
  );
}

interface PanelCardProps extends ShownCard {
  /**
   * Takes the reader to the text the card is about, found where the document now has it, so the
   * card need not be drawn again as its text moves; none without a view to take them in.
   */
  readonly onShow?: ((target: AnchorTarget) => void) | undefined;
  /** Makes a card the active one, by its item's key. */
  readonly onSelect: (key: Key) => void;
}

/** A thread or a suggestion the document anchors, with the offer to show its text. */
export const PanelCard = memo(
  function PanelCard({ item, actions, onShow, onSelect }: PanelCardProps) {
    const shows = onShow && (item.kind === 'thread' || item.kind === 'suggestion');
    return (
      <PanelItem
        isActive={actions.isActive}
        onSelect={() => onSelect(item.key)}
        slot={hooks.slot(item.kind === 'suggestion' ? 'suggestion' : 'thread', { anchored: true })}
      >
        {renderCommentCard(item, actions)}
        {shows ? (
          <Button size="sm" variant="ghost" onPress={() => onShow(item.target)}>
            {actions.context.labels.showInDocument}
          </Button>
        ) : null}
      </PanelItem>
    );
  },
  (previous, next) =>
    previous.onShow === next.onShow &&
    previous.onSelect === next.onSelect &&
    isSameCardShown(previous, next),
);

interface UnanchoredCardProps {
  readonly thread: CommentThread;
  readonly isActive: boolean;
  readonly context: CardContext;
  readonly onSelect: (key: Key) => void;
}

/** A thread the document no longer anchors: changed in the store alone. */
export const UnanchoredCard = memo(function UnanchoredCard({
  thread,
  isActive,
  context,
  onSelect,
}: UnanchoredCardProps) {
  const { comments } = context;
  return (
    <PanelItem
      isActive={isActive}
      onSelect={() => onSelect(`comment:${thread.id}`)}
      slot={hooks.slot('thread', { anchored: false })}
    >
      <ThreadCard
        thread={thread}
        isActive={isActive}
        context={context}
        onResolve={async (resolved) => {
          await comments.setState(thread.id, resolved ? 'resolved' : 'open');
        }}
        onRemove={() => comments.remove(thread.id)}
      />
    </PanelItem>
  );
});
