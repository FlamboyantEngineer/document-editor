// The comments margin: the document's open threads and its suggestions as cards beside the pages,
// level with the text they are about, and the offer to comment on the selected text. Threads are
// kept by the host's comment store; their anchors are kept in the document (`comment_highlight`).

import {
  type Annotation,
  AnnotationLayer,
  AnnotationMargin,
} from '@flamboyantengineer/ui-components/annotation-layer';
import type { CommentTextFormat } from '@flamboyantengineer/ui-components/comment-thread';
import type { Key } from '@flamboyantengineer/ui-components/core';
import type { MenuEntry } from '@flamboyantengineer/ui-components/menu';
import type { RichTextStateUpdate } from '@flamboyantengineer/ui-components/rich-text-editor';
import type { Command, EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { type ReactNode, type RefObject, useMemo, useState } from 'react';
import type { Suggestion, SuggestionPolicy } from '../../engine/index.js';
import type { CommentStoreAdapter, IdentityAdapter, MentionsAdapter } from '../../host/index.js';
import {
  type CommentActionTarget,
  DEFAULT_COMMENTS_LABELS,
  type DocumentCommentsLabels,
  hooks,
  type MentionCardTarget,
  type ThreadActionTarget,
} from './comment-cards.js';
import { useCommentControls } from './comment-controls.js';
import type { CommentsAudience, CommentsFilter, ThreadFilter } from './comment-filters.js';
import { type OpenComment, type StartComment, useCommentFocus } from './comment-focus.js';
import { caretKey, type CommentItem, listCommentItems } from './comment-items.js';
import { useCommentPointer } from './comment-pointer-controls.js';
import { WithCommentThreads } from './comment-threads-provider.js';
import type { CommentPointer } from './document-pointer.js';
import { MarginCard, useCardPolicy, useStableCallbacks } from './margin-card.js';
import type { ReplyStart, ShownActivity } from './thread-card-hooks.js';
import type { ThreadPermissionPolicy } from './thread-permissions.js';
import { type MeasureOptions, useAnchorRects } from './use-anchor-rects.js';
import { useCardContext } from './use-card-context.js';
import {
  type CommentThreads,
  useProvidedCommentThreads,
  useSuggestionAuthors,
} from './use-comment-threads.js';
import { useMarginOpening } from './use-open-cards.js';
import { useSuggestionThreads } from './use-suggestion-threads.js';
import { useTargetWriteBack } from './use-target-write-back.js';

export type {
  OpenComment,
  StartComment,
  StartCommentOptions,
  ThreadTarget,
} from './comment-focus.js';
export { EditorCommentThreads } from './comment-threads-provider.js';
export { DocumentCommentsPanel } from './comments-panel.js';
export type { CommentPointer } from './document-pointer.js';
export type { ThreadPermissionPolicy, ThreadPermissions } from './thread-permissions.js';
export { SharedCommentThreadsContext } from './use-comment-threads.js';

/** Where a document's comments are kept and what the reader may do with them. */
export interface DocumentCommentsOptions {
  /** The host's comment store. */
  store: CommentStoreAdapter;
  /** The document the threads belong to. */
  documentId: string;
  /** Who the reader is, and the names of the people who wrote comments. */
  identity: IdentityAdapter;
  /** Whether the reader may start and answer threads. Defaults to true. */
  canComment?: boolean | undefined;
  /**
   * What the reader may do in each thread (reply, resolve, react, edit and delete their own), of
   * what `canComment` allows; everything by default.
   */
  threadPermissions?: ThreadPermissionPolicy | undefined;
  /** The text the margin shows, beside the defaults. */
  labels?: Partial<DocumentCommentsLabels> | undefined;
  /**
   * Which threads the margin shows: the open ones (the default), all of them, resolved ones too to
   * read or reopen, or the reader's own open ones, which they wrote or which mention them.
   */
  filter?: CommentsFilter | undefined;
  /**
   * What comments may mention: people, groups and assistants, in the host's token format. Without
   * it, comments mention the people `identity` finds.
   */
  mentions?: MentionsAdapter | undefined;
  /** Whether the reader is among the people a thread is for; threads they are not are hidden. */
  audience?: CommentsAudience | undefined;
  /** How comments read: as plain text (the default) or as inline Markdown (`markdown-inline`). */
  format?: CommentTextFormat | undefined;
  /**
   * The card a mention's chip opens; by default a `UserIdentity` with the name and the picture the
   * identity gives, and none with null.
   */
  mentionCard?: ((target: MentionCardTarget) => ReactNode) | null | undefined;
  /**
   * The host's own actions in each comment's menu, after Edit and Delete, such as copying a link
   * to it; the opening comment's (`index` 0) act on the whole thread.
   */
  commentActions?: ((target: CommentActionTarget) => readonly MenuEntry[]) | undefined;
  /**
   * The host's own actions in each thread's and each suggestion's header menu, after the opening
   * comment's Edit and Delete, such as copying a link to it; the menu shows also while the thread is
   * resolved or the reader may not comment.
   */
  threadActions?: ((target: ThreadActionTarget) => readonly MenuEntry[]) | undefined;
  /** Whether deleting a comment asks for confirmation first; true by default. */
  confirmsDelete?: boolean | undefined;
  /**
   * The text a thread's reply starts with for the reader, such as a mention of the assistant the
   * reader's last comment asked; used only while nothing is typed for the thread.
   */
  replyStart?: ReplyStart | undefined;
  /**
   * Called once a reply being written for the reader (a `pending` comment) is drawn and painted on
   * a card, once for each card that shows it, so the host may start the work behind it only then.
   */
  onActivityShown?: ((shown: ShownActivity) => void) | undefined;
  /**
   * Shows a marker beside the text of each thread and suggestion, whose card opens only when the
   * reader asks for it (`markers`, the default), or a card for each (`cards`).
   */
  presentation?: 'cards' | 'markers' | undefined;
  /** The space between a page's end edge and the cards beside it, in pixels; 20 by default. */
  cardGap?: number | undefined;
  /**
   * Makes no card active once focus leaves the margin and its popups, so the active card's
   * emphasis and its text's go with it. Off by default: the active card follows the caret.
   */
  clearsActiveOnBlur?: boolean | undefined;
  /**
   * Where the threads show: in a margin beside the pages (`margin`, the default), or only in the
   * comments panel (`pane`), which then holds the thread being started too and leaves the document
   * its whole width.
   */
  placement?: 'margin' | 'pane' | undefined;
  /**
   * With the margin, whether starting a thread, opening one or clicking its text also shows the
   * comments pane of the editor's side panel, as the pane placement always does. Off by default.
   */
  revealsPane?: boolean | undefined;
  /**
   * Starts a thread for each of the reader's suggestions once they pause, `delay` milliseconds
   * (800 by default), and keeps it to what the suggestion does. Off by default.
   */
  suggestionThreads?: boolean | { delay?: number | undefined } | undefined;
  /**
   * Whether the reader may accept a suggestion, and reject it, while they may decide at all; both
   * by default.
   */
  decide?:
    ((suggestion: Suggestion, me: string) => { accept: boolean; reject: boolean }) | undefined;
}

interface DocumentCommentsProps extends DocumentCommentsOptions {
  state: EditorState;
  onStateChange: (update: RichTextStateUpdate) => void;
  /** Whether the reader may accept and reject suggestions. */
  suggestionPolicy: SuggestionPolicy;
  /** Receives the way to start a thread on the selected text while the reader may comment. */
  startRef?: RefObject<StartComment | null> | undefined;
  /** Receives the way to take the reader to a thread. */
  openRef?: RefObject<OpenComment | null> | undefined;
  /** The editor's view, which the comments' changes go through (`useCommentControls`). */
  view?: EditorView | null | undefined;
  /** Shows the pane holding the comments, for a thread started or opened (`placement`, `revealsPane`). */
  onReveal?: (() => void) | undefined;
  /** Receives what the comments do with pointer presses and clicks in the document. */
  pointerRef?: RefObject<CommentPointer | null> | undefined;
  /** Told once a suggestion names the thread just started for it, so the document saves now. */
  onSuggestionLinked?: (() => void) | undefined;
  /** The document's content. */
  children: ReactNode;
}

// Keeps the stored threads to the document while the reader may edit: the reader's suggestions get
// their threads, and moved text its targets.
function useThreadUpkeep(
  props: DocumentCommentsProps,
  comments: CommentThreads,
  run: (command: Command) => void,
) {
  const editable = props.view?.editable ?? false;
  useSuggestionThreads({ state: props.state, comments, run, options: props, editable });
  useTargetWriteBack({ state: props.state, comments, editable });
}

// The caret moving into another card's text makes that card active.
function useCaretActive(caret: string | null, setActive: (key: Key) => void) {
  const [lastCaret, setLastCaret] = useState(caret);
  if (caret !== lastCaret) {
    setLastCaret(caret);
    if (caret !== null) setActive(caret);
  }
}

/**
 * Wraps the document's content in an annotation layer with a margin of cards: each open thread
 * and each suggestion level with its text, and, while text is selected, a button that starts a
 * thread on it. Resolved threads are hidden; their anchors stay in the document. The threads are
 * those of the provider around it, or of its own.
 */
export function DocumentComments(props: DocumentCommentsProps) {
  const failed = props.labels?.failed ?? DEFAULT_COMMENTS_LABELS.failed;
  return (
    <WithCommentThreads {...props} failed={failed}>
      {props.placement === 'pane' ? <PaneComments {...props} /> : <CommentsMargin {...props} />}
    </WithCommentThreads>
  );
}

// The document alone, its threads shown in the comments panel, which the editor still reaches.
function PaneComments(props: DocumentCommentsProps) {
  const comments = useProvidedCommentThreads(props);
  const focus = useCommentFocus();
  const { onReveal } = props;
  const { run } = useCommentControls({
    ...props,
    canComment: props.canComment ?? true,
    comments,
    onStart: onReveal,
    onOpen: onReveal,
  });
  // The reader's suggestions get their threads wherever the threads are shown.
  useThreadUpkeep(props, comments, run);
  // Commented text, clicked, takes the reader to its thread in the pane, ready to answer.
  useCommentPointer(props, {
    run,
    open: (anchor) => {
      if (anchor.kind !== 'comment' || !comments.threads.has(anchor.id)) return;
      focus.open({ threadId: anchor.id }, { focus: 'reply' });
      onReveal?.();
    },
  });
  return props.children;
}

// With the margin, the pane holding the comments shows too only when the host asks.
const revealOf = (props: Pick<DocumentCommentsProps, 'revealsPane' | 'onReveal'>) =>
  props.revealsPane ? props.onReveal : undefined;

// Makes the thread just started the active one, and shows the pane holding the comments.
const startedThen =
  (setActive: (key: Key) => void, reveal: (() => void) | undefined) => (key: Key) => {
    setActive(key);
    reveal?.();
  };

// Each item's annotation, measured in the layer, with where its card and its marker sit.
function useMarginGeometry(
  layer: HTMLElement | null,
  items: readonly CommentItem[],
  { open, ...options }: MeasureOptions & { readonly open: ReadonlySet<Key> },
) {
  const targets = useMemo(() => new Map(items.map((item) => [item.key, item.target])), [items]);
  const { rects, offsets, markers } = useAnchorRects(layer, targets, options);
  const annotations = useMemo<Annotation[]>(
    () => items.map((item) => ({ id: item.key, rects: rects.get(item.key) ?? [] })),
    [items, rects],
  );
  // With markers, each marker is set beside its page and its card opens beneath it unmoved; an
  // open card stays beside its page, where showing the card shows the page's edge too.
  const place = (key: string) => (open.has(key) ? offsets : markers).get(key);
  return {
    annotations,
    cardOffset: (key: string) => (options.markers ? undefined : offsets.get(key)),
    markerOffset: options.markers
      ? (annotation: Annotation) => place(String(annotation.id))
      : undefined,
  };
}

function CommentsMargin(props: DocumentCommentsProps) {
  const { state, children, canComment = true } = props;
  const labels = useMemo(() => ({ ...DEFAULT_COMMENTS_LABELS, ...props.labels }), [props.labels]);
  const comments = useProvidedCommentThreads(props, useSuggestionAuthors(state));
  const [active, setActive] = useState<Key | null>(null);
  const [layer, setLayer] = useState<HTMLDivElement | null>(null);
  const shared = { comments, canComment, labels, scope: 'margin' as const };
  const { context, listed, opened } = useCardContext(props, shared);
  const shown = props.filter ?? 'open';
  const filter = useMemo<ThreadFilter>(() => ({ ...listed, filter: shown }), [listed, shown]);
  const { run, startThread } = useCommentControls({
    ...props,
    canComment,
    comments,
    onStart: startedThen(setActive, revealOf(props)),
  });
  useThreadUpkeep(props, comments, run);
  const items = useMemo(
    () => listCommentItems(state, { threads: comments.threads, canComment, filter }),
    [state, comments.threads, canComment, filter],
  );
  const cards = useMarginOpening(props, {
    items,
    layer,
    opened,
    run,
    startThread,
    setActive,
    active,
  });
  const { annotations, cardOffset, markerOffset } = useMarginGeometry(layer, items, {
    gap: props.cardGap,
    markers: cards.markers,
    open: cards.openKeys,
  });
  useCaretActive(caretKey(items, state), setActive);
  const byKey = new Map(items.map((item) => [item.key, item]));
  const policy = useCardPolicy(props.suggestionPolicy, comments.threads);
  const commands = useStableCallbacks({
    run,
    startThread: () => startThread(),
    // The thread just stored stays the active card, and keeps focus.
    onStored: (key) => {
      setActive(key);
      cards.focusOn(key, 'card');
    },
  });
  return (
    <AnnotationLayer
      ref={setLayer}
      className={hooks.className}
      data-cards-open={
        cards.markers ? String(items.some((item) => cards.openKeys.has(item.key))) : undefined
      }
      annotations={annotations}
      currentKey={active}
      onCurrentKeyChange={setActive}
    >
      {children}
      <AnnotationMargin
        {...hooks.slot('margin')}
        aria-label={labels.comments}
        presentation={cards.markers ? 'icons' : 'cards'}
        openKeys={cards.openKeys}
        onOpenChange={cards.onOpenChange}
        getInlineOffset={markerOffset}
        clearsActiveOnBlur={props.clearsActiveOnBlur}
        renderCard={(annotation, { isActive }) => {
          const item = byKey.get(String(annotation.id));
          return item ? (
            <MarginCard
              item={item}
              offset={cardOffset(item.key)}
              actions={{ context, isActive, policy, ...commands }}
            />
          ) : null;
        }}
      />
    </AnnotationLayer>
  );
}
