// The cards of the comments panel, each drawn again only when what it shows changes. The panel is
// given every state of the document, also while its pane is hidden, so typing beside hundreds of
// threads must not draw every card again (DOCE-COMMENTS-3.7).

import { Button } from '@flamboyantengineer/ui-components/button';
import { memo, type ReactNode, useEffect, useRef } from 'react';
import type { CommentThread } from '../../host/index.js';
import type { AnchorTarget } from './anchor-rects.js';
import { type CardContext, ThreadCard } from './comment-cards.js';
import { renderCommentCard } from './comment-items.js';
import { hooks } from './comments-panel-hooks.js';
import { isSameCardShown, type ShownCard } from './margin-card.js';

// An item of the panel, scrolled into view within the panel when it becomes the active one.
function PanelItem({
  isActive,
  slot,
  children,
}: {
  isActive: boolean;
  slot: ReturnType<typeof hooks.slot>;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (isActive) ref.current?.scrollIntoView?.({ block: 'nearest' });
  }, [isActive]);
  return (
    <div ref={ref} {...slot}>
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
}

/** A thread or a suggestion the document anchors, with the offer to show its text. */
export const PanelCard = memo(
  function PanelCard({ item, actions, onShow }: PanelCardProps) {
    const shows = onShow && (item.kind === 'thread' || item.kind === 'suggestion');
    return (
      <PanelItem
        isActive={actions.isActive}
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
  (previous, next) => previous.onShow === next.onShow && isSameCardShown(previous, next),
);

interface UnanchoredCardProps {
  readonly thread: CommentThread;
  readonly isActive: boolean;
  readonly context: CardContext;
}

/** A thread the document no longer anchors: changed in the store alone. */
export const UnanchoredCard = memo(function UnanchoredCard({
  thread,
  isActive,
  context,
}: UnanchoredCardProps) {
  const { comments } = context;
  return (
    <PanelItem isActive={isActive} slot={hooks.slot('thread', { anchored: false })}>
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
