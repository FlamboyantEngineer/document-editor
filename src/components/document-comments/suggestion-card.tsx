// A suggestion's card: a thread that opens with who made the suggestion and what it does, with
// Accept and Reject in its header for a reader who may decide, then its discussion.

import { Button, ButtonGroup } from '@flamboyantengineer/ui-components/button';
import {
  CommentThread,
  CommentThreadReply,
} from '@flamboyantengineer/ui-components/comment-thread';
import { CheckGlyph, CloseGlyph } from '@flamboyantengineer/ui-components/core';
import {
  InlineTextDiff,
  type InlineTextDiffSegment,
} from '@flamboyantengineer/ui-components/text-diff';
import type { Suggestion } from '../../engine/index.js';
import type { CommentThread as StoredThread } from '../../host/index.js';
import { activityRows } from './comment-activity-rows.js';
import {
  type CardContext,
  cardLayout,
  DraftComposer,
  hooks,
  Reactions,
  renderEntries,
} from './comment-cards.js';
import type { DocumentCommentsLabels } from './comments-labels.js';

// What a suggestion changes, as the removed and the added text; whitespace alone shows by name.
function changeOf(suggestion: Suggestion, labels: DocumentCommentsLabels): InlineTextDiffSegment[] {
  const shown = (text: string) => (text.trim() === '' ? labels.whitespace(text) : text);
  return [
    ...(suggestion.deleted ? [{ kind: 'removed' as const, text: shown(suggestion.deleted) }] : []),
    ...(suggestion.inserted ? [{ kind: 'added' as const, text: shown(suggestion.inserted) }] : []),
  ];
}

// What a suggestion does, and whether it shows no text change.
function summaryOf(suggestion: Suggestion, { labels }: CardContext) {
  const split = suggestion.inserted !== '' && suggestion.inserted === suggestion.deleted;
  const formatOnly = suggestion.formatted && !suggestion.inserted && !suggestion.deleted;
  const action = split
    ? labels.split
    : formatOnly
      ? labels.format
      : suggestion.deleted && suggestion.inserted
        ? labels.replace
        : suggestion.deleted
          ? labels.remove
          : labels.insert;
  return { split: split || formatOnly, action };
}

// Accept and Reject, as icons in the card's header, for a reader who may decide.
function DecisionButtons({
  canDecide,
  onDecide,
  labels,
}: {
  canDecide: { readonly accept: boolean; readonly reject: boolean };
  onDecide: (accept: boolean) => void;
  labels: DocumentCommentsLabels;
}) {
  if (!canDecide.accept && !canDecide.reject) return null;
  return (
    <ButtonGroup aria-label={labels.decide}>
      {canDecide.accept ? (
        <Button
          size="sm"
          icon={CheckGlyph}
          label={labels.accept}
          tooltip={labels.accept}
          onPress={() => onDecide(true)}
        />
      ) : null}
      {canDecide.reject ? (
        <Button
          size="sm"
          icon={CloseGlyph}
          label={labels.reject}
          tooltip={labels.reject}
          onPress={() => onDecide(false)}
        />
      ) : null}
    </ButtonGroup>
  );
}

/**
 * The post a suggestion opens its card with: who made it, when its thread started, what it does,
 * and the reactions to the thread as a whole.
 */
function SuggestionPost({
  suggestion,
  thread,
  context,
}: {
  suggestion: Suggestion;
  thread: StoredThread | null;
  context: CardContext;
}) {
  const { labels, comments } = context;
  const { split, action } = summaryOf(suggestion, context);
  const person = suggestion.author ? comments.people.get(suggestion.author) : undefined;
  return (
    <CommentThreadReply
      author={person ?? { name: labels.someone }}
      time={thread?.createdAt ?? null}
      text={action}
      reactions={thread ? <Reactions thread={thread} context={context} /> : undefined}
      {...hooks.slot('change')}
    >
      <p>{action}</p>
      {split ? null : <InlineTextDiff segments={changeOf(suggestion, labels)} />}
    </CommentThreadReply>
  );
}

/**
 * A suggestion: who made it and what it changes, Accept and Reject for a reader who may decide, and
 * its discussion, whose composer shows on the active card.
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
  const { canComment, labels, comments } = context;
  return (
    <CommentThread
      aria-label={labels.suggestion}
      {...cardLayout(context)}
      mentions={context.mentions}
      headerActions={<DecisionButtons canDecide={canDecide} onDecide={onDecide} labels={labels} />}
      menu={context.threadActions?.({ thread, suggestion: suggestion.id })}
      composer={
        canComment ? (
          <DraftComposer
            context={context}
            draftKey={`suggestion:${suggestion.id}`}
            first={false}
            onSubmit={onReply}
          />
        ) : undefined
      }
      isReadOnly={!canComment}
      isSelected={isActive}
      activity={thread ? activityRows(comments.activity.get(thread.id), context) : undefined}
    >
      <SuggestionPost key="suggestion" suggestion={suggestion} thread={thread} context={context} />
      {thread ? renderEntries({ thread, context }) : null}
    </CommentThread>
  );
}
