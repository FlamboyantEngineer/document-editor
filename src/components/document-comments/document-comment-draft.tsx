// Comments on the whole document, started from the comments panel: the action that starts one, and
// the thread being started, at the end of the panel's comments on the whole document.

import { Button } from '@flamboyantengineer/ui-components/button';
import { ChatBubblePlusGlyph } from '@flamboyantengineer/ui-components/core';
import { useState } from 'react';
import { createElementId } from '../../engine/index.js';
import type { CardContext } from './comment-cards.js';
import { hooks } from './comments-panel-hooks.js';
import { PendingCard } from './new-thread-cards.js';

/** The thread on the whole document the reader is starting, by its id, and how to start or end it. */
export function useDocumentDraft() {
  const [draft, setDraft] = useState<string | null>(null);
  return {
    draft,
    start: () => setDraft((current) => current ?? createElementId()),
    close: () => setDraft(null),
  };
}

/** Starts a thread on the whole document. */
export function AddDocumentComment({
  context,
  onPress,
}: {
  context: CardContext;
  onPress: () => void;
}) {
  const label = context.labels.addDocumentComment;
  return (
    <Button
      size="sm"
      variant="ghost"
      icon={ChatBubblePlusGlyph}
      label={label}
      tooltip={label}
      onPress={onPress}
    />
  );
}

/** The thread on the whole document being started: the composer of its opening comment. */
export function DocumentDraftItem({
  id,
  context,
  onClose,
}: {
  id: string;
  context: CardContext;
  onClose: () => void;
}) {
  return (
    <div role="listitem" {...hooks.slot('thread', { anchored: false, draft: true })}>
      <PendingCard
        id={id}
        context={context}
        onSubmit={async (text) => {
          await context.comments.create({ id, quote: '', text, scope: 'document' });
          onClose();
        }}
        onCancel={onClose}
      />
    </div>
  );
}
