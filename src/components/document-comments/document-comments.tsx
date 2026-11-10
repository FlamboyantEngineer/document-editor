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
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { addCommentAnchor, createElementId } from '../../engine/index.js';
import type { CommentStoreAdapter, IdentityAdapter } from '../../host/index.js';
import { type AnchorTarget, isSameMeasurement, measureAnchors } from './anchor-rects.js';
import {
  type CardContext,
  DEFAULT_COMMENTS_LABELS,
  type DocumentCommentsLabels,
  hooks,
} from './comment-cards.js';
import { type CommentItem, listCommentItems, renderCommentCard } from './comment-items.js';
import { useCommentThreads } from './use-comment-threads.js';

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

// The anchors' rectangles, measured after each change of the document or of the cards, and
// again when the layer resizes.
function useAnchorRects(
  layer: HTMLElement | null,
  targets: ReadonlyMap<string, AnchorTarget>,
): ReadonlyMap<string, readonly AnnotationRect[]> {
  const [rects, setRects] = useState<ReadonlyMap<string, readonly AnnotationRect[]>>(new Map());
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
        const next = measureAnchors(layer, latest.current);
        setRects((current) => (isSameMeasurement(current, next) ? current : next));
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
  return rects;
}

// Runs a command on the latest state the caller holds.
function useRunCommand(onStateChange: DocumentCommentsProps['onStateChange']) {
  return useMemo(
    () => (command: Command) =>
      onStateChange((current) => {
        let next = current;
        command(current, (tr) => {
          next = current.apply(tr);
        });
        return next;
      }),
    [onStateChange],
  );
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
 * thread on it. Resolved threads are hidden; their anchors stay in the document.
 */
export function DocumentComments(props: DocumentCommentsProps) {
  const { state, onStateChange, canDecide, children, canComment = true } = props;
  const labels = useMemo(() => ({ ...DEFAULT_COMMENTS_LABELS, ...props.labels }), [props.labels]);
  const comments = useCommentThreads({ ...props, failed: labels.failed });
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [active, setActive] = useState<Key | null>(null);
  const [layer, setLayer] = useState<HTMLDivElement | null>(null);
  const run = useRunCommand(onStateChange);
  const items = useMemo(
    () => listCommentItems(state, { threads: comments.threads, pending, canComment }),
    [state, comments.threads, pending, canComment],
  );
  const targets = useMemo(() => new Map(items.map((item) => [item.key, item.target])), [items]);
  const rects = useAnchorRects(layer, targets);
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
  const context: CardContext = {
    comments,
    me: props.identity.currentPerson().id,
    canComment,
    labels,
  };
  const byKey = new Map(items.map((item) => [item.key, item]));
  const settle = (id: string) =>
    setPending((current) => new Set([...current].filter((each) => each !== id)));
  const startThread = () => {
    const id = createElementId();
    setPending((current) => new Set(current).add(id));
    run(addCommentAnchor(id));
    setActive(`comment:${id}`);
  };
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
        renderCard={(annotation, { isActive }) => {
          const item = byKey.get(String(annotation.id));
          return item
            ? renderCommentCard(item, {
                context,
                isActive,
                canDecide,
                run,
                startThread,
                settle,
              })
            : null;
        }}
      />
    </AnnotationLayer>
  );
}
