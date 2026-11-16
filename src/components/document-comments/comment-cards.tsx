// The cards of the comments margin and panel: an open thread, a thread being started and the offer
// to comment on the selection, and the parts a suggestion's card shares (`suggestion-card.tsx`).

import { Badge } from '@flamboyantengineer/ui-components/badge';
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
import type { MenuEntry } from '@flamboyantengineer/ui-components/menu';
import { ReactionBar } from '@flamboyantengineer/ui-components/reaction-bar';
import { UserIdentity } from '@flamboyantengineer/ui-components/user-identity';
import { type ReactNode, useEffect, useRef } from 'react';
import type { CommentEntry, CommentThread as StoredThread } from '../../host/index.js';
import { createHooks } from '../../utils/hooks.js';
import { activityRows } from './comment-activity-rows.js';
import type { OpenedComment } from './comment-focus.js';
import type { DocumentCommentsLabels } from './comments-labels.js';
import {
  type ReplyStart,
  replyStartOf,
  type ShownActivity,
  useActivityShown,
} from './thread-card-hooks.js';
import { resolveThreadPermissions, type ThreadPermissionPolicy } from './thread-permissions.js';
import type { CommentThreads } from './use-comment-threads.js';
import { focusCard } from './use-open-cards.js';

export { DEFAULT_COMMENTS_LABELS, type DocumentCommentsLabels } from './comments-labels.js';

export const hooks = createHooks('document-comments', ['margin', 'card', 'decision', 'change']);

/** What a mention's chip names: a person, a group, or another kind the host mentions. */
export type MentionCardTarget = Parameters<NonNullable<CommentTextProps['renderCard']>>[0];

/** The comment a menu action is for: the thread's opening comment (`index` 0) or a reply. */
export interface CommentActionTarget {
  readonly thread: StoredThread;
  readonly entry: CommentEntry;
  readonly index: number;
}

/**
 * The thread or the suggestion a header menu's action is for: a suggestion's card has no thread
 * until someone comments on it.
 */
export interface ThreadActionTarget {
  readonly thread: StoredThread | null;
  /** The suggestion the card shows or the thread discusses, when there is one. */
  readonly suggestion: string | null;
}

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
   * The card a mention's chip opens; by default a `UserIdentity` with the name and the picture the
   * identity gives, and none with null.
   */
  readonly mentionCard?: ((target: MentionCardTarget) => ReactNode) | null | undefined;
  /** What the reader may do in each thread, of what `canComment` allows. */
  readonly threadPermissions?: ThreadPermissionPolicy | undefined;
  /** The host's own actions in a comment's menu, after Edit and Delete. */
  readonly commentActions?: ((target: CommentActionTarget) => readonly MenuEntry[]) | undefined;
  /** The host's own actions in a thread's or a suggestion's header menu. */
  readonly threadActions?: ((target: ThreadActionTarget) => readonly MenuEntry[]) | undefined;
  /** Whether deleting a comment asks for confirmation first. */
  readonly confirmsDelete?: boolean | undefined;
  /** Where the cards show, which keeps their comments' element ids apart. */
  readonly scope: 'margin' | 'panel';
  /** The comment the reader was taken to, which its thread points at. */
  readonly opened?: OpenedComment | null | undefined;
  /** The text a thread being started begins with. */
  readonly newText?: string | null | undefined;
  /** The text a thread's next reply starts with, when nothing is typed for it. */
  readonly replyStart?: ReplyStart | undefined;
  /** Tells the host a reply being written for the reader shows. */
  readonly onActivityShown?: ((shown: ShownActivity) => void) | undefined;
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
  startValue,
}: {
  context: CardContext;
  draftKey: string;
  first: boolean;
  onSubmit: (text: string) => Promise<unknown>;
  /** The text to begin with, such as a reply a link starts, in place of the kept draft. */
  defaultValue?: string | undefined;
  /** The text to begin with when nothing is kept for the thread. */
  startValue?: string | undefined;
}) {
  const { labels } = context;
  return (
    <CommentComposer
      mentions={context.mentions}
      defaultValue={defaultValue ?? startValue}
      // A kept draft would hide the text a host starts the reply with.
      persistKey={
        defaultValue === undefined ? `de-comments:${context.documentId}:${draftKey}` : undefined
      }
      label={first ? labels.addComment : labels.reply}
      placeholder={first ? undefined : labels.replyPlaceholder}
      submitLabel={first ? labels.submitComment : labels.reply}
      // One row, whose buttons show while the reader writes in it.
      minRows={1}
      actionsOnFocus
      onSubmit={onSubmit}
    />
  );
}

/**
 * A comment's reactions, or without `entry` the thread's own, which the reader toggles while the
 * store keeps reactions.
 */
export function Reactions({
  thread,
  entry,
  context,
}: {
  thread: StoredThread;
  entry?: CommentEntry | undefined;
  context: CardContext;
}) {
  const { comments, me, labels } = context;
  const { react } = comments;
  const reactions = Object.entries((entry ?? thread).reactions ?? {}).map(([emoji, ids]) => ({
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
        react && resolveThreadPermissions(thread, context).react
          ? (emoji, reacted) =>
              void react({ threadId: thread.id, entryId: entry?.id, emoji, reacted }).catch(
                () => undefined,
              )
          : undefined
      }
    />
  );
}

// What the reader may do with a comment of a thread: edit their own, and delete their own last
// reply, or their own thread from its opening comment; a moderator, anyone's.
function entryActions(
  thread: StoredThread,
  { entry, index }: { entry: CommentEntry; index: number },
  { context, onRemove }: { context: CardContext; onRemove?: (() => Promise<void>) | undefined },
) {
  const may = resolveThreadPermissions(thread, context);
  const own = may.mayChange(entry);
  const { edit, removeEntry } = context.comments;
  const removeReply = removeEntry
    ? () => removeEntry({ threadId: thread.id, entryId: entry.id })
    : undefined;
  return {
    onEdit:
      own && may.edit && edit
        ? (text: string) => edit({ threadId: thread.id, entryId: entry.id, text })
        : undefined,
    onDelete: own && may.remove ? (index === 0 ? onRemove : removeReply) : undefined,
  };
}

// The card a mention's chip opens, as the context asks.
function mentionCardOf(context: CardContext): CommentTextProps['renderCard'] {
  const { mentionCard, comments } = context;
  if (mentionCard === null) return undefined;
  return (
    mentionCard ??
    ((target) => <UserIdentity name={target.name} src={comments.people.get(target.id)?.src} />)
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
        // A comment an assistant wrote names it, for the host to mark it so.
        data-agent={entry.agent}
        author={people.get(entry.author) ?? { name: context.labels.someone }}
        time={entry.createdAt}
        text={entry.text}
        isEdited={Boolean(entry.editedAt)}
        reactions={<Reactions thread={thread} entry={entry} context={context} />}
        actions={context.commentActions?.({ thread, entry, index })}
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

/**
 * How every card lays out a thread: icon-only Resolve, Reopen in the header menu, the composer only
 * on the selected card, and replies indented under the opening comment.
 */
export function cardLayout(context: CardContext) {
  return {
    resolveIconOnly: true,
    resolveInMenu: true,
    composerOnSelect: true,
    indentReplies: true,
    confirmsDelete: context.confirmsDelete ?? true,
  };
}

// A thread's header: Resolve and Reopen, the host's menu, and how a decided suggestion's thread
// was decided, which stays decided.
function headerOf(
  thread: StoredThread,
  context: CardContext,
  {
    mayResolve,
    onResolve,
  }: { mayResolve: boolean; onResolve: (resolved: boolean) => Promise<void> },
) {
  const decision = thread.decision?.decision;
  const { labels } = context;
  return {
    isResolved: thread.state === 'resolved',
    // The button waits for the store; a refusal shows on the thread as a row.
    onResolvedChange:
      mayResolve && !decision
        ? (resolved: boolean) => onResolve(resolved).catch(() => undefined)
        : undefined,
    menu: context.threadActions?.({ thread, suggestion: thread.suggestion }),
    headerActions: decision ? (
      <Badge
        size="sm"
        tone={decision === 'accept' ? 'success' : 'neutral'}
        {...hooks.slot('decision', { decision })}
      >
        {decision === 'accept' ? labels.accepted : labels.rejected}
      </Badge>
    ) : undefined,
  };
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
  const { comments } = context;
  const may = resolveThreadPermissions(thread, context);
  const opened = context.opened?.threadId === thread.id ? context.opened : null;
  const root = useRef<HTMLDivElement>(null);
  // In the panel, a thread whose text the reader clicked is ready to answer.
  const answer = context.scope === 'panel' && opened?.focus === 'reply' ? opened.sequence : null;
  useEffect(() => {
    if (answer !== null) focusCard(root.current, 'reply');
  }, [answer]);
  useActivityShown(thread, { onActivityShown: context.onActivityShown, card: root });
  const start = replyStartOf(thread, context);
  return (
    <CommentThread
      ref={root}
      data-agent={thread.agent}
      {...cardLayout(context)}
      {...headerOf(thread, context, { mayResolve: may.resolve, onResolve })}
      firstInMenu
      mentions={context.mentions}
      quote={thread.quote}
      highlightedId={opened?.entryId ? entryElementId(context, opened.entryId) : undefined}
      composer={
        may.reply ? (
          <DraftComposer
            // A reply a link starts takes the composer's place, with the text it begins with.
            // A new start, as after a reply, draws the composer again to begin with it.
            key={
              opened?.reply === undefined
                ? `draft:${start ?? ''}`
                : `opened-${String(opened.sequence)}`
            }
            context={context}
            draftKey={thread.id}
            first={thread.entries.length === 0}
            onSubmit={(text) => comments.reply(thread.id, text)}
            defaultValue={opened?.reply}
            startValue={start}
          />
        ) : undefined
      }
      isReadOnly={!may.reply && !may.resolve}
      isSelected={isActive}
      activity={activityRows(comments.activity.get(thread.id), context)}
    >
      {renderEntries({ thread, context, onRemove })}
    </CommentThread>
  );
}
