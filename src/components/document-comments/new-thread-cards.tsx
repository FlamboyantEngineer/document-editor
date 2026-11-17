// The cards that start a thread: the offer to comment on the selected text, and the thread being
// started, with the composer of its opening comment.

import { Button } from '@flamboyantengineer/ui-components/button';
import { CommentComposer } from '@flamboyantengineer/ui-components/comment-composer';
import { CommentThread } from '@flamboyantengineer/ui-components/comment-thread';
import { ChatBubblePlusGlyph } from '@flamboyantengineer/ui-components/core';
import { useState } from 'react';
import type { CardContext } from './comment-cards.js';
import { useFocusOnMount } from './comment-mentions.js';

/** A thread the reader is starting: its quote and the composer of its opening comment. */
export function PendingCard({
  id,
  quote,
  context,
  onSubmit,
  onCancel,
}: {
  /** The thread's id, which keeps the text typed for it apart from any other thread's. */
  id: string;
  /** The text it is started on; none for a thread on the whole document. */
  quote?: string | undefined;
  context: CardContext;
  onSubmit: (text: string) => Promise<unknown>;
  onCancel: () => void;
}) {
  const composer = useFocusOnMount();
  // Why the store refused the thread last, shown until it is submitted again; the text stays.
  const [refused, setRefused] = useState<string | null>(null);
  const submit = async (text: string) => {
    setRefused(null);
    try {
      return await onSubmit(text);
    } catch (error) {
      setRefused(error instanceof Error ? error.message : String(error));
      throw error;
    }
  };
  return (
    <CommentThread
      mentions={context.mentions}
      quote={quote || undefined}
      isSelected
      onClose={onCancel}
      error={refused ?? undefined}
      composer={
        <CommentComposer
          ref={composer}
          mentions={context.mentions}
          autoFocus
          defaultValue={context.newText ?? undefined}
          persistKey={
            context.newText == null ? `de-comments:${context.documentId}:new:${id}` : undefined
          }
          submitLabel={context.labels.submitComment}
          onSubmit={submit}
          onCancel={onCancel}
        />
      }
    />
  );
}

/** Offers to start a thread on the selected text. */
export function DraftCard({ context, onComment }: { context: CardContext; onComment: () => void }) {
  return (
    <Button size="sm" startIcon={ChatBubblePlusGlyph} onPress={onComment}>
      {context.labels.comment}
    </Button>
  );
}
