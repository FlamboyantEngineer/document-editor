// The comments margin: the document's open threads and its suggestions as cards beside the pages,
// level with the text they are about, and the offer to comment on the selected text. Threads are
// kept by the host's comment store; their anchors are kept in the document (`comment_highlight`).

import {
  type Annotation,
  AnnotationLayer,
  AnnotationMargin,
  type AnnotationRect,
} from '@flamboyantengineer/ui-components/annotation-layer';
import type { CommentTextFormat } from '@flamboyantengineer/ui-components/comment-thread';
import type { Key } from '@flamboyantengineer/ui-components/core';
import type { MenuEntry } from '@flamboyantengineer/ui-components/menu';
import type { RichTextStateUpdate } from '@flamboyantengineer/ui-components/rich-text-editor';
import type { EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import {
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Suggestion, SuggestionPolicy } from '../../engine/index.js';
import type { CommentStoreAdapter, IdentityAdapter, MentionsAdapter } from '../../host/index.js';
import {
  type AnchorTarget,
  isSameMeasurement,
  isSameOffsets,
  measureAnchors,
  measureCardOffsets,
} from './anchor-rects.js';
import {
  type CardContext,
  type CommentActionTarget,
  DEFAULT_COMMENTS_LABELS,
  type DocumentCommentsLabels,
  hooks,
  type MentionCardTarget,
} from './comment-cards.js';
import { useCommentControls } from './comment-controls.js';
import type { CommentsAudience, CommentsFilter, ThreadFilter } from './comment-filters.js';
import {
  type OpenComment,
  type OpenedComment,
  type StartComment,
  useCommentFocus,
} from './comment-focus.js';
import { caretKey, listCommentItems, renderCommentCard } from './comment-items.js';
import { useCommentMentions } from './comment-mentions.js';
import { WithCommentThreads } from './comment-threads-provider.js';
import type { ThreadPermissionPolicy } from './thread-permissions.js';
import { useProvidedCommentThreads, useSuggestionAuthors } from './use-comment-threads.js';
import { useSuggestionThreads } from './use-suggestion-threads.js';

export type {
  OpenComment,
  StartComment,
  StartCommentOptions,
  ThreadTarget,
} from './comment-focus.js';
export { EditorCommentThreads } from './comment-threads-provider.js';
export { DocumentCommentsPanel } from './comments-panel.js';
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
   * The card a mention's chip opens; by default a `UserCard` with the name and the picture the
   * identity gives, and none with null.
   */
  mentionCard?: ((target: MentionCardTarget) => ReactNode) | null | undefined;
  /**
   * The host's own actions in each comment's menu, before Edit and Delete, such as copying a link
   * to it; the opening comment's (`index` 0) act on the whole thread.
   */
  commentActions?: ((target: CommentActionTarget) => readonly MenuEntry[]) | undefined;
  /**
   * Shows a card for each thread and suggestion (`cards`, the default), or a marker for each that
   * opens its card (`markers`), which leaves the document more room.
   */
  presentation?: 'cards' | 'markers' | undefined;
  /**
   * Where the threads show: in a margin beside the pages (`margin`, the default), or only in the
   * comments panel (`pane`), which then holds the thread being started too and leaves the document
   * its whole width.
   */
  placement?: 'margin' | 'pane' | undefined;
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
  /** The document's content. */
  children: ReactNode;
}

interface Measured {
  /** Each anchor's rectangles. */
  readonly rects: ReadonlyMap<string, readonly AnnotationRect[]>;
  /** How far each card moves to sit beside its anchor's page. */
  readonly offsets: ReadonlyMap<string, number>;
}

const NOTHING_MEASURED: Measured = { rects: new Map(), offsets: new Map() };

// The anchors' rectangles and the cards' offsets, measured after each change of the document or
// of the cards, and again when the layer resizes.
function useAnchorRects(
  layer: HTMLElement | null,
  targets: ReadonlyMap<string, AnchorTarget>,
): Measured {
  const [measured, setMeasured] = useState<Measured>(NOTHING_MEASURED);
  const latest = useRef(targets);
  useLayoutEffect(() => {
    latest.current = targets;
  });
  useLayoutEffect(() => {
    const view = layer?.ownerDocument.defaultView;
    if (!layer || !view) return;
    let frame = 0;
    const measure = () => {
      view.cancelAnimationFrame(frame);
      frame = view.requestAnimationFrame(() => {
        const rects = measureAnchors(layer, latest.current);
        const margin = layer.querySelector(`:scope > .${MARGIN_CLASS}`);
        const offsets = measureCardOffsets(layer, margin, latest.current);
        setMeasured((current) =>
          isSameMeasurement(current.rects, rects) && isSameOffsets(current.offsets, offsets)
            ? current
            : { rects, offsets },
        );
      });
    };
    measure();
    // Without resize observers, as in a test document, only changes of its content measure again.
    const observer =
      typeof view.ResizeObserver === 'function' ? new view.ResizeObserver(measure) : null;
    observer?.observe(layer);
    const content = new view.MutationObserver(measure);
    content.observe(layer, { subtree: true, childList: true, characterData: true });
    return () => {
      view.cancelAnimationFrame(frame);
      observer?.disconnect();
      content.disconnect();
    };
  }, [layer, targets]);
  return measured;
}

const MARGIN_CLASS = 'de-document-comments__margin';

// What every card reads, with mentions of the people the host's identity finds, and which threads
// and suggestions the margin shows.
function useCardContext(
  props: DocumentCommentsProps,
  shared: Pick<CardContext, 'comments' | 'canComment' | 'labels'>,
): { context: CardContext; filter: ThreadFilter; opened: OpenedComment | null } {
  const mentions = useCommentMentions(props.identity, props.mentions);
  const me = props.identity.currentPerson().id;
  const { format, mentionCard, audience, commentActions, threadPermissions } = props;
  const host = props.mentions;
  const listed = useMemo(
    () => ({
      filter: props.filter ?? 'open',
      me,
      audience,
      parse: mentions.parse,
      includes: host?.includes?.bind(host),
    }),
    [props.filter, me, audience, mentions, host],
  );
  const focus = useCommentFocus();
  const revealed = focus.opened?.threadId;
  const filter = useMemo(() => ({ ...listed, revealed }), [listed, revealed]);
  const context: CardContext = {
    ...shared,
    mentions,
    format,
    mentionCard,
    commentActions,
    threadPermissions,
    documentId: props.documentId,
    me,
    scope: 'margin',
    opened: focus.opened,
    newText: focus.newText,
  };
  return { context, filter, opened: focus.opened };
}

// A card beside its anchor's page, whatever the page's size and orientation.
function PlacedCard({
  offset = 0,
  children,
}: {
  offset?: number | undefined;
  children: ReactNode;
}) {
  return (
    <div
      {...hooks.slot('card')}
      style={{ '--de-comment-offset': `${String(offset)}px` } as CSSProperties}
    >
      {children}
    </div>
  );
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
  useCommentControls({ ...props, canComment: props.canComment ?? true, comments });
  return props.children;
}

function CommentsMargin(props: DocumentCommentsProps) {
  const { state, children, canComment = true } = props;
  const labels = useMemo(() => ({ ...DEFAULT_COMMENTS_LABELS, ...props.labels }), [props.labels]);
  const comments = useProvidedCommentThreads(props, useSuggestionAuthors(state));
  const [active, setActive] = useState<Key | null>(null);
  const [layer, setLayer] = useState<HTMLDivElement | null>(null);
  const { context, filter, opened } = useCardContext(props, { comments, canComment, labels });
  const { run, startThread } = useCommentControls({
    ...props,
    canComment,
    comments,
    onStart: setActive,
  });
  useSuggestionThreads({ state, comments, run, options: props });
  // A thread the reader is taken to becomes the active card.
  const [lastOpened, setLastOpened] = useState(opened);
  if (opened !== lastOpened) {
    setLastOpened(opened);
    if (opened) setActive(`comment:${opened.threadId}`);
  }
  const items = useMemo(
    () => listCommentItems(state, { threads: comments.threads, canComment, filter }),
    [state, comments.threads, canComment, filter],
  );
  const targets = useMemo(() => new Map(items.map((item) => [item.key, item.target])), [items]);
  const { rects, offsets } = useAnchorRects(layer, targets);
  const annotations = useMemo<Annotation[]>(
    () => items.map((item) => ({ id: item.key, rects: rects.get(item.key) ?? [] })),
    [items, rects],
  );
  const caret = caretKey(items, state);
  // The caret moving into another card's text makes that card active.
  const [lastCaret, setLastCaret] = useState(caret);
  if (caret !== lastCaret) {
    setLastCaret(caret);
    if (caret !== null) setActive(caret);
  }
  const byKey = new Map(items.map((item) => [item.key, item]));
  // Unattributed suggestions are their thread's writer's (DOCE-SUGGESTIONS-2.5).
  const policy = {
    ...props.suggestionPolicy,
    threadAuthor: (thread: string) => comments.threads.get(thread)?.entries[0]?.author,
  };
  return (
    <AnnotationLayer
      ref={setLayer}
      className={hooks.className}
      annotations={annotations}
      currentKey={active}
      onCurrentKeyChange={setActive}
    >
      {children}
      <AnnotationMargin
        {...hooks.slot('margin')}
        aria-label={labels.comments}
        presentation={props.presentation === 'markers' ? 'icons' : 'cards'}
        renderCard={(annotation, { isActive }) => {
          const item = byKey.get(String(annotation.id));
          return item ? (
            <PlacedCard offset={offsets.get(item.key)}>
              {renderCommentCard(item, {
                context,
                isActive,
                policy,
                run,
                startThread: () => startThread(),
              })}
            </PlacedCard>
          ) : null;
        }}
      />
    </AnnotationLayer>
  );
}
