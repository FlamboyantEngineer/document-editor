// The comments margin: the document's open threads and its suggestions as cards beside the pages,
// level with the text they are about, and the offer to comment on the selected text. Threads are
// kept by the host's comment store; their anchors are kept in the document (`comment_highlight`).

import {
  type Annotation,
  AnnotationLayer,
  AnnotationMargin,
  type AnnotationRect,
} from '@flamboyantengineer/ui-components/annotation-layer';
import type { Key } from '@flamboyantengineer/ui-components/core';
import type { RichTextStateUpdate } from '@flamboyantengineer/ui-components/rich-text-editor';
import type { Command, EditorState } from 'prosemirror-state';
import {
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  canStartComment,
  createElementId,
  startCommentDraft,
  type Suggestion,
  suggestionDecisionOf,
} from '../../engine/index.js';
import type { CommentStoreAdapter, IdentityAdapter } from '../../host/index.js';
import {
  type AnchorTarget,
  isSameMeasurement,
  isSameOffsets,
  measureAnchors,
  measureCardOffsets,
} from './anchor-rects.js';
import {
  type CardContext,
  DEFAULT_COMMENTS_LABELS,
  type DocumentCommentsLabels,
  hooks,
} from './comment-cards.js';
import { type CommentItem, listCommentItems, renderCommentCard } from './comment-items.js';
import { useCommentMentions } from './comment-mentions.js';
import { WithCommentThreads } from './comment-threads-provider.js';
import {
  type CommentThreads,
  useProvidedCommentThreads,
  useSuggestionAuthors,
} from './use-comment-threads.js';
import { recordDecision } from './use-decision-records.js';
import { useSuggestionThreads } from './use-suggestion-threads.js';

export { EditorCommentThreads } from './comment-threads-provider.js';
export { DocumentCommentsPanel } from './comments-panel.js';
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
  /** The text the margin shows, beside the defaults. */
  labels?: Partial<DocumentCommentsLabels> | undefined;
  /** Shows resolved threads too, to read or reopen. Defaults to false. */
  showResolved?: boolean | undefined;
  /**
   * Shows a card for each thread and suggestion (`cards`, the default), or a marker for each that
   * opens its card (`markers`), which leaves the document more room.
   */
  presentation?: 'cards' | 'markers' | undefined;
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
  canDecide: boolean;
  /** Receives the way to start a thread on the selected text while the reader may comment. */
  startRef?: RefObject<(() => void) | null> | undefined;
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

// What every card reads, with mentions of the people the host's identity finds.
function useCardContext(
  props: DocumentCommentsProps,
  shared: Pick<CardContext, 'comments' | 'canComment' | 'labels'>,
): CardContext {
  const mentions = useCommentMentions(props.identity);
  return {
    ...shared,
    mentions,
    documentId: props.documentId,
    me: props.identity.currentPerson().id,
  };
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

// Runs a command on the latest state the caller holds. A command that decides suggestions has its
// decision recorded on their threads, read from a run on the state shown, since the caller applies
// it later and outside the editor's transactions.
function useRunCommand(
  onStateChange: DocumentCommentsProps['onStateChange'],
  { state, comments }: { state: EditorState; comments: CommentThreads },
) {
  return (command: Command) => {
    command(state, (tr) => {
      const report = suggestionDecisionOf(tr);
      if (report) recordDecision(comments, report);
    });
    onStateChange((current) => {
      let next = current;
      command(current, (tr) => {
        next = current.apply(tr);
      });
      return next;
    });
  };
}

// The card the caret is in: a thread's or a suggestion's, else the offer to comment on a selection.
function caretKey(items: readonly CommentItem[], state: EditorState): string | null {
  const { head } = state.selection;
  const inside = items.find(
    (item) => item.kind !== 'draft' && item.from <= head && head <= item.to,
  );
  return (inside ?? items.find((item) => item.kind === 'draft'))?.key ?? null;
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
      <CommentsMargin {...props} />
    </WithCommentThreads>
  );
}

function CommentsMargin(props: DocumentCommentsProps) {
  const { state, onStateChange, canDecide, children, canComment = true } = props;
  const labels = useMemo(() => ({ ...DEFAULT_COMMENTS_LABELS, ...props.labels }), [props.labels]);
  const comments = useProvidedCommentThreads(props, useSuggestionAuthors(state));
  const [active, setActive] = useState<Key | null>(null);
  const [layer, setLayer] = useState<HTMLDivElement | null>(null);
  const run = useRunCommand(onStateChange, { state, comments });
  useSuggestionThreads({ state, comments, run, options: props });
  const { showResolved, decide } = props;
  const items = useMemo(
    () => listCommentItems(state, { threads: comments.threads, canComment, showResolved }),
    [state, comments.threads, canComment, showResolved],
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
  const context = useCardContext(props, { comments, canComment, labels });
  const byKey = new Map(items.map((item) => [item.key, item]));
  // A thread starts as a draft on the selection, or the caret's block, until the store keeps it.
  const startThread = () => {
    if (!canStartComment(state)) return;
    const id = createElementId();
    run(startCommentDraft(id));
    setActive(`comment:${id}`);
  };
  const decisions = (suggestion: Suggestion) =>
    canDecide
      ? (decide?.(suggestion, context.me) ?? { accept: true, reject: true })
      : { accept: false, reject: false };
  const { startRef } = props;
  useEffect(() => {
    if (!startRef) return undefined;
    startRef.current = canComment ? startThread : null;
    return () => {
      startRef.current = null;
    };
  });
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
                canDecide: decisions,
                run,
                startThread,
              })}
            </PlacedCard>
          ) : null;
        }}
      />
    </AnnotationLayer>
  );
}
