// The cards of the comments margin: an open thread, a thread being started, a suggestion with its
// discussion and decision, and the offer to comment on the selection.

import { Button } from '@flamboyantengineer/ui-components/button';
import { CommentComposer } from '@flamboyantengineer/ui-components/comment-composer';
import {
  CommentThread,
  CommentThreadReply,
} from '@flamboyantengineer/ui-components/comment-thread';
import { ReactionBar } from '@flamboyantengineer/ui-components/reaction-bar';
import type { Suggestion } from '../../engine/index.js';
import type { CommentEntry, CommentThread as StoredThread } from '../../host/index.js';
import { createHooks } from '../../utils/hooks.js';
import type { CommentThreads } from './use-comment-threads.js';

/** The text the comments margin shows. */
export interface DocumentCommentsLabels {
  /** Names the margin. */
  comments: string;
  /** Starts a thread on the selected text. */
  comment: string;
  accept: string;
  reject: string;
  /** Introduces the text a suggestion adds. */
  insert: string;
  /** Introduces the text a suggestion deletes. */
  remove: string;
  /** Describes a suggestion that splits a paragraph. */
  split: string;
  /** Names a writer the host does not know. */
  someone: string;
  /** Reports a change the comment store refused without saying why. */
  failed: string;
  /** Names a comment's reactions. */
  reactions: string;
}

/** The labels of the comments margin unless the host gives its own. */
export const DEFAULT_COMMENTS_LABELS: DocumentCommentsLabels = {
  comments: 'Comments',
  comment: 'Comment',
  accept: 'Accept',
  reject: 'Reject',
  insert: 'Add',
  remove: 'Delete',
  split: 'Split the paragraph',
  someone: 'Someone',
  failed: 'The comment could not be saved.',
  reactions: 'Reactions',
};

export const hooks = createHooks('document-comments', [
  'margin',
  'draft',
  'suggestion',
  'summary',
  'decisions',
]);

/** What every card reads: the threads, the reader and the labels. */
export interface CardContext {
  readonly comments: CommentThreads;
  /** The reader's person id. */
  readonly me: string;
  readonly canComment: boolean;
  readonly labels: DocumentCommentsLabels;
}

// A comment's reactions, which the reader toggles while the store keeps reactions.
function Reactions({
  thread,
  entry,
  context,
}: {
  thread: StoredThread;
  entry: CommentEntry;
  context: CardContext;
}) {
  const { comments, me, labels } = context;
  const { react } = comments;
  const reactions = Object.entries(entry.reactions ?? {}).map(([emoji, ids]) => ({
    emoji,
    isReacted: ids.includes(me),
    people: ids.map((id) => comments.people.get(id)?.name ?? labels.someone),
  }));
  if (!react && reactions.length === 0) return null;
  return (
    <ReactionBar
      aria-label={labels.reactions}
      reactions={reactions}
      onToggle={
        react && context.canComment
          ? (emoji, reacted) =>
              void react({ threadId: thread.id, entryId: entry.id, emoji, reacted }).catch(
                () => undefined,
              )
          : undefined
      }
    />
  );
}

// What the reader may do with a comment of a thread: edit their own, and delete their own reply,
// or their own thread from its opening comment.
function entryActions(
  thread: StoredThread,
  { entry, index }: { entry: CommentEntry; index: number },
  { context, onRemove }: { context: CardContext; onRemove?: (() => Promise<void>) | undefined },
) {
  const { comments, me, canComment } = context;
  const own = canComment && entry.author === me;
  const { edit, removeEntry } = comments;
  const removeReply = removeEntry
    ? () => removeEntry({ threadId: thread.id, entryId: entry.id })
    : undefined;
  return {
    onEdit:
      own && edit
        ? (text: string) => edit({ threadId: thread.id, entryId: entry.id, text })
        : undefined,
    onDelete: own ? (index === 0 ? onRemove : removeReply) : undefined,
  };
}

function Entries({
  thread,
  context,
  onRemove,
}: {
  thread: StoredThread;
  context: CardContext;
  onRemove?: (() => Promise<void>) | undefined;
}) {
  const { people } = context.comments;
  return thread.entries.map((entry, index) => (
    <CommentThreadReply
      key={entry.id}
      author={people.get(entry.author) ?? { name: context.labels.someone }}
      time={entry.createdAt}
      text={entry.text}
      isEdited={Boolean(entry.editedAt)}
      reactions={<Reactions thread={thread} entry={entry} context={context} />}
      {...entryActions(thread, { entry, index }, { context, onRemove })}
    />
  ));
}

/** An open thread on the document's text. */
export function ThreadCard({
  thread,
  isActive,
  context,
  onResolve,
  onRemove,
}: {
  thread: StoredThread;
  isActive: boolean;
  context: CardContext;
  /** Resolves the thread, or reopens it. */
  onResolve: (resolved: boolean) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const { canComment, comments } = context;
  return (
    <CommentThread
      quote={thread.quote}
      isResolved={thread.state === 'resolved'}
      onResolvedChange={canComment ? (resolved) => void onResolve(resolved) : undefined}
      onReply={canComment ? (text) => comments.reply(thread.id, text) : undefined}
      isReadOnly={!canComment}
      isSelected={isActive}
    >
      <Entries thread={thread} context={context} onRemove={onRemove} />
    </CommentThread>
  );
}

/** A thread the reader is starting: its quote and the composer of its opening comment. */
export function PendingCard({
  quote,
  context,
  onSubmit,
  onCancel,
}: {
  quote: string;
  context: CardContext;
  onSubmit: (text: string) => Promise<unknown>;
  onCancel: () => void;
}) {
  return (
    <CommentThread
      quote={quote}
      isSelected
      composer={
        <CommentComposer
          autoFocus
          submitLabel={context.labels.comment}
          onSubmit={onSubmit}
          onCancel={onCancel}
        />
      }
    />
  );
}

function Summary({ suggestion, context }: { suggestion: Suggestion; context: CardContext }) {
  const { labels, comments } = context;
  const author = suggestion.author
    ? (comments.people.get(suggestion.author)?.name ?? suggestion.author)
    : labels.someone;
  const split = suggestion.inserted !== '' && suggestion.inserted === suggestion.deleted;
  return (
    <p {...hooks.slot('summary')}>
      <strong>{author}</strong>
      {split ? ` ${labels.split}` : null}
      {!split && suggestion.deleted ? (
        <span>
          {` ${labels.remove} `}
          <del>{suggestion.deleted}</del>
        </span>
      ) : null}
      {!split && suggestion.inserted ? (
        <span>
          {` ${labels.insert} `}
          <ins>{suggestion.inserted}</ins>
        </span>
      ) : null}
    </p>
  );
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
  return (
    <div {...hooks.slot('suggestion', { active: isActive })}>
      <Summary suggestion={suggestion} context={context} />
      {canDecide.accept || canDecide.reject ? (
        <div {...hooks.slot('decisions')}>
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
        </div>
      ) : null}
      {thread || (canComment && isActive) ? (
        <CommentThread
          onReply={canComment ? onReply : undefined}
          isReadOnly={!canComment}
          isSelected={isActive}
        >
          {thread ? <Entries thread={thread} context={context} /> : null}
        </CommentThread>
      ) : null}
    </div>
  );
}

/** Offers to start a thread on the selected text. */
export function DraftCard({ context, onComment }: { context: CardContext; onComment: () => void }) {
  return (
    <div {...hooks.slot('draft')}>
      <Button size="sm" onPress={onComment}>
        {context.labels.comment}
      </Button>
    </div>
  );
}
