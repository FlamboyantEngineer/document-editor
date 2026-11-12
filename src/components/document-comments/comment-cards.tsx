// The cards of the comments margin and panel: an open thread, a thread being started and the offer
// to comment on the selection, and the parts a suggestion's card shares (`suggestion-card.tsx`).

import { Button } from '@flamboyantengineer/ui-components/button';
import {
  CommentComposer,
  type CommentMentions,
} from '@flamboyantengineer/ui-components/comment-composer';
import {
  CommentText,
  type CommentTextFormat,
  type CommentTextProps,
  CommentThread,
  CommentThreadReply,
} from '@flamboyantengineer/ui-components/comment-thread';
import { ChatBubblePlusGlyph } from '@flamboyantengineer/ui-components/core';
import { ReactionBar } from '@flamboyantengineer/ui-components/reaction-bar';
import { UserCard } from '@flamboyantengineer/ui-components/user-card';
import type { ReactNode } from 'react';
import type { CommentEntry, CommentThread as StoredThread } from '../../host/index.js';
import { createHooks } from '../../utils/hooks.js';
import { activityRows } from './comment-activity-rows.js';
import type { OpenedComment } from './comment-focus.js';
import { useFocusOnMount } from './comment-mentions.js';
import type { DocumentCommentsLabels } from './comments-labels.js';
import type { CommentThreads } from './use-comment-threads.js';

export { DEFAULT_COMMENTS_LABELS, type DocumentCommentsLabels } from './comments-labels.js';

export const hooks = createHooks('document-comments', ['margin', 'card']);

/** What a mention's chip names: a person, a group, or another kind the host mentions. */
export type MentionTarget = Parameters<NonNullable<CommentTextProps['renderCard']>>[0];

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
  /** How comments read: as plain text (the default) or as inline Markdown. */
  readonly format?: CommentTextFormat | undefined;
  /**
   * The card a mention's chip opens; by default a `UserCard` with the name and the picture the
   * identity gives, and none with null.
   */
  readonly mentionCard?: ((target: MentionTarget) => ReactNode) | null | undefined;
  /** Where the cards show, which keeps their comments' element ids apart. */
  readonly scope: 'margin' | 'panel';
  /** The comment the reader was taken to, which its thread points at. */
  readonly opened?: OpenedComment | null | undefined;
  /** The text a thread being started begins with. */
  readonly newText?: string | null | undefined;
}

/** The element id of a comment where the cards show. */
function entryElementId(context: CardContext, entryId: string): string {
  return `de-comment-${context.scope}-${entryId}`;
}

/**
 * The composer of a thread's next comment, its draft kept in the provider's storage under the
 * thread, so it survives the card going and the page loading again.
 */
export function DraftComposer({
  context,
  draftKey,
  first,
  onSubmit,
  defaultValue,
}: {
  context: CardContext;
  draftKey: string;
  first: boolean;
  onSubmit: (text: string) => Promise<unknown>;
  /** The text to begin with, such as a reply a link starts. */
  defaultValue?: string | undefined;
}) {
  const { labels } = context;
  return (
    <CommentComposer
      mentions={context.mentions}
      defaultValue={defaultValue}
      // A kept draft would hide the text a host starts the reply with.
      persistKey={
        defaultValue === undefined ? `de-comments:${context.documentId}:${draftKey}` : undefined
      }
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

// The card a mention's chip opens, as the context asks.
function mentionCardOf(context: CardContext): CommentTextProps['renderCard'] {
  const { mentionCard, comments } = context;
  if (mentionCard === null) return undefined;
  return (
    mentionCard ??
    ((target) => <UserCard name={target.name} src={comments.people.get(target.id)?.src} />)
  );
}

/**
 * A thread's comments, as the thread's own children, so it finds the one it points at by its id.
 */
export function renderEntries({
  thread,
  context,
  onRemove,
}: {
  thread: StoredThread;
  context: CardContext;
  onRemove?: (() => Promise<void>) | undefined;
}) {
  const { people } = context.comments;
  const renderCard = mentionCardOf(context);
  // A reply still being written, or that failed, shows as an activity row instead.
  return thread.entries.map((entry, index) =>
    entry.status ? null : (
      <CommentThreadReply
        key={entry.id}
        id={entryElementId(context, entry.id)}
        author={people.get(entry.author) ?? { name: context.labels.someone }}
        time={entry.createdAt}
        text={entry.text}
        isEdited={Boolean(entry.editedAt)}
        reactions={<Reactions thread={thread} entry={entry} context={context} />}
        {...entryActions(thread, { entry, index }, { context, onRemove })}
      >
        <CommentText
          text={entry.text}
          format={context.format}
          parse={context.mentions?.parse}
          renderCard={renderCard}
        />
      </CommentThreadReply>
    ),
  );
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
  const opened = context.opened?.threadId === thread.id ? context.opened : null;
  return (
    <CommentThread
      mentions={context.mentions}
      quote={thread.quote}
      highlightedId={opened?.entryId ? entryElementId(context, opened.entryId) : undefined}
      isResolved={thread.state === 'resolved'}
      onResolvedChange={canComment ? (resolved) => void onResolve(resolved) : undefined}
      composer={
        canComment ? (
          <DraftComposer
            // A reply a link starts takes the composer's place, with the text it begins with.
            key={opened?.reply === undefined ? 'draft' : `opened-${String(opened.sequence)}`}
            context={context}
            draftKey={thread.id}
            first={thread.entries.length === 0}
            onSubmit={(text) => comments.reply(thread.id, text)}
            defaultValue={opened?.reply}
          />
        ) : undefined
      }
      isReadOnly={!canComment}
      isSelected={isActive}
      activity={activityRows(comments.activity.get(thread.id), context)}
    >
      {renderEntries({ thread, context, onRemove })}
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
          defaultValue={context.newText ?? undefined}
          persistKey={context.newText == null ? `de-comments:${context.documentId}:new` : undefined}
          submitLabel={context.labels.comment}
          onSubmit={onSubmit}
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
