// The cards of the comments margin: an open thread, a thread being started, a suggestion with its
// discussion and decision, and the offer to comment on the selection.

import { Button } from '@flamboyantengineer/ui-components/button';
import {
  CommentComposer,
  type CommentMentions,
} from '@flamboyantengineer/ui-components/comment-composer';
import {
  CommentThread,
  CommentThreadReply,
} from '@flamboyantengineer/ui-components/comment-thread';
import { ReactionBar } from '@flamboyantengineer/ui-components/reaction-bar';
import type { Suggestion } from '../../engine/index.js';
import type { CommentEntry, CommentThread as StoredThread } from '../../host/index.js';
import { createHooks } from '../../utils/hooks.js';
import { useFocusOnMount } from './comment-mentions.js';
import type { DocumentCommentsLabels } from './comments-labels.js';
import type { CommentThreads } from './use-comment-threads.js';

export { DEFAULT_COMMENTS_LABELS, type DocumentCommentsLabels } from './comments-labels.js';

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
  /** The document the threads belong to, which keys the composers' drafts. */
  readonly documentId: string;
  /** Mentions of the people the host's identity finds. */
  readonly mentions?: CommentMentions | undefined;
}

/**
 * The composer of a thread's next comment, its draft kept in the provider's storage under the
 * thread, so it survives the card going and the page loading again.
 */
function DraftComposer({
  context,
  draftKey,
  first,
  onSubmit,
}: {
  context: CardContext;
  draftKey: string;
  first: boolean;
  onSubmit: (text: string) => Promise<unknown>;
}) {
  const { labels } = context;
  return (
    <CommentComposer
      mentions={context.mentions}
      persistKey={`de-comments:${context.documentId}:${draftKey}`}
      label={first ? labels.addComment : labels.reply}
      submitLabel={first ? labels.comment : labels.reply}
      onSubmit={onSubmit}
    />
  );
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
      mentions={context.mentions}
      quote={thread.quote}
      isResolved={thread.state === 'resolved'}
      onResolvedChange={canComment ? (resolved) => void onResolve(resolved) : undefined}
      composer={
        canComment ? (
          <DraftComposer
            context={context}
            draftKey={thread.id}
            first={thread.entries.length === 0}
            onSubmit={(text) => comments.reply(thread.id, text)}
          />
        ) : undefined
      }
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
  const composer = useFocusOnMount();
  return (
    <CommentThread
      mentions={context.mentions}
      quote={quote}
      isSelected
      composer={
        <CommentComposer
          ref={composer}
          mentions={context.mentions}
          autoFocus
          persistKey={`de-comments:${context.documentId}:new`}
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
