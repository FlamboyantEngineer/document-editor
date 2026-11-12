// A suggestion's card: who made it and what it does, Accept and Reject for a reader who may decide,
// and its discussion.

import { Button } from '@flamboyantengineer/ui-components/button';
import { ButtonGroup } from '@flamboyantengineer/ui-components/button-group';
import { Card } from '@flamboyantengineer/ui-components/card';
import { CommentThread } from '@flamboyantengineer/ui-components/comment-thread';
import {
  InlineTextDiff,
  type InlineTextDiffSegment,
} from '@flamboyantengineer/ui-components/inline-text-diff';
import type { Suggestion } from '../../engine/index.js';
import type { CommentThread as StoredThread } from '../../host/index.js';
import { type CardContext, DraftComposer, renderEntries } from './comment-cards.js';
import type { DocumentCommentsLabels } from './comments-labels.js';

// What a suggestion changes, as the removed and the added text; whitespace alone shows by name.
function changeOf(suggestion: Suggestion, labels: DocumentCommentsLabels): InlineTextDiffSegment[] {
  const shown = (text: string) => (text.trim() === '' ? labels.whitespace(text) : text);
  return [
    ...(suggestion.deleted ? [{ kind: 'removed' as const, text: shown(suggestion.deleted) }] : []),
    ...(suggestion.inserted ? [{ kind: 'added' as const, text: shown(suggestion.inserted) }] : []),
  ];
}

// Who suggested the change, and what it does.
function summaryOf(suggestion: Suggestion, context: CardContext) {
  const { labels, comments } = context;
  // Until the host names its author, a suggestion says someone made it, never showing an id.
  const author =
    (suggestion.author ? comments.people.get(suggestion.author)?.name : undefined) ??
    labels.someone;
  const split = suggestion.inserted !== '' && suggestion.inserted === suggestion.deleted;
  const action = split
    ? labels.split
    : suggestion.deleted && suggestion.inserted
      ? labels.replace
      : suggestion.deleted
        ? labels.remove
        : labels.insert;
  return { author, split, action };
}

/**
 * A suggestion: what it changes, Accept and Reject for a reader who may decide, and its thread,
 * which an active card offers to start.
 */
export function SuggestionCard({
  suggestion,
  thread,
  isActive,
  context,
  canDecide,
  onDecide,
  onReply,
}: {
  suggestion: Suggestion;
  thread: StoredThread | null;
  isActive: boolean;
  context: CardContext;
  /** Whether the reader may accept the suggestion, and reject it. */
  canDecide: { readonly accept: boolean; readonly reject: boolean };
  onDecide: (accept: boolean) => void;
  onReply: (text: string) => Promise<unknown>;
}) {
  const { canComment, labels } = context;
  const { author, split, action } = summaryOf(suggestion, context);
  return (
    <Card
      density="compact"
      isSelected={isActive}
      title={author}
      description={action}
      footer={
        canDecide.accept || canDecide.reject ? (
          <ButtonGroup aria-label={labels.decide}>
            {canDecide.accept ? (
              <Button size="sm" variant="primary" onPress={() => onDecide(true)}>
                {labels.accept}
              </Button>
            ) : null}
            {canDecide.reject ? (
              <Button size="sm" onPress={() => onDecide(false)}>
                {labels.reject}
              </Button>
            ) : null}
          </ButtonGroup>
        ) : null
      }
    >
      {split ? null : <InlineTextDiff segments={changeOf(suggestion, labels)} />}
      {thread || (canComment && isActive) ? (
        <CommentThread
          mentions={context.mentions}
          composer={
            canComment ? (
              <DraftComposer
                context={context}
                draftKey={`suggestion:${suggestion.id}`}
                first={!thread?.entries.length}
                onSubmit={onReply}
              />
            ) : undefined
          }
          isReadOnly={!canComment}
          isSelected={isActive}
        >
          {thread ? renderEntries({ thread, context }) : null}
        </CommentThread>
      ) : null}
    </Card>
  );
}
