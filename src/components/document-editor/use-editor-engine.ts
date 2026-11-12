// The editor's engine plumbing: the dispatch body that turns changes into suggestions and commits
// proofing results on the latest state, the engine's events kept stable across the host's renders,
// and the view props that read the browser's selection before keys and bind the find key.

import type { RichTextEngineEvents } from '@flamboyantengineer/ui-components/rich-text-editor';
import type { EditorState, Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  automationActor,
  isReviewOnlyChange,
  proofingUpdate,
  type ReviewChange,
  reviewChangeOf,
  suggestTransaction,
} from '../../engine/index.js';
import { readDomSelection } from '../../utils/dom-selection.js';
import {
  contentChangeCause,
  type DocumentEditorNotifications,
  isContentChange,
} from './use-host-events.js';

/** What the plumbing reads of the editor's props. */
export interface EnginePlumbingProps {
  readonly onStateChange: (update: (state: EditorState) => EditorState) => void;
  readonly events?: Omit<RichTextEngineEvents, 'props'> | undefined;
  readonly onContentChange?: DocumentEditorNotifications['onContentChange'];
  readonly onReviewChange?: ((change: ReviewChange, tr: Transaction) => void) | undefined;
}

type DispatchBody = NonNullable<RichTextEngineEvents['dispatchTransaction']>;

// The dispatch body. A transaction that only brings proofing results commits on the latest state,
// which the view may not show yet. While suggesting, each local change is rewritten as a
// suggestion, and one a suggestion cannot record is dropped; the host's own body, if any, then
// decides what commits.
export function useDispatchBody(
  props: EnginePlumbingProps,
  suggesting: boolean,
  author: string | null,
): DispatchBody {
  const { events, onStateChange } = props;
  const body = events?.dispatchTransaction;
  return useMemo(
    () => (tr, view, commit) => {
      const update = proofingUpdate(tr);
      if (update) {
        onStateChange(update);
        return;
      }
      // An automation change is direct or a suggestion as its caller chose, and a review-only
      // change, such as anchoring a comment, is never a suggestion.
      const next =
        suggesting && !automationActor(tr) && !isReviewOnlyChange(tr)
          ? suggestTransaction(tr, view.state, { author })
          : tr;
      if (!next) return;
      if (body) body(next, view, commit);
      else if (next === tr) commit.applyDefault();
      else commit.applyDefault(next);
    },
    [suggesting, author, body, onStateChange],
  );
}

// Before a key or typed text acts, the view takes the selection the browser shows (DOCE-EDITOR-1.4).
function readSelectionFirst(view: EditorView): boolean {
  readDomSelection(view);
  return false;
}

export const READ_SELECTION_FIRST = {
  keydown: readSelectionFirst,
  beforeinput: readSelectionFirst,
};

type EngineEvents = NonNullable<EnginePlumbingProps['events']>;

/**
 * The engine's events as the editor keeps them: `onMounted` may name the view the host is shown,
 * such as the canonical view over a projection, beside the view the engine mounted.
 */
export type EngineViewEvents = Omit<EngineEvents, 'onMounted'> & {
  onMounted(view: EditorView, shown?: EditorView): void;
};

/** The transactions the engine applies, for the parts of the editor that follow them. */
export interface TransactionFeed {
  /** Calls `listener` with each transaction until the returned function is called. */
  subscribe(listener: (tr: Transaction) => void): () => void;
}

function createTransactionFeed() {
  const listeners = new Set<(tr: Transaction) => void>();
  return {
    feed: {
      subscribe: (listener: (tr: Transaction) => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    } satisfies TransactionFeed,
    publish: (tr: Transaction) => {
      for (const listener of listeners) listener(tr);
    },
  };
}

// The caller's events, with the engine's view kept for the chrome that acts on it, and the feed of
// its transactions.

/** The host's notifications of changes, as the engine's view calls them. */
export type ChangeNotifications = Pick<EnginePlumbingProps, 'onContentChange' | 'onReviewChange'>;

export function useEngineView(
  events: EnginePlumbingProps['events'],
  notifications: ChangeNotifications,
  tap?: (tr: Parameters<NonNullable<RichTextEngineEvents['onTransaction']>>[0]) => void,
) {
  const [view, setView] = useState<EditorView | null>(null);
  const [{ feed, publish }] = useState(createTransactionFeed);
  // The host's latest events, behind handlers that keep their identity: a new events object on
  // each of the host's renders would otherwise give the view new props, which redraws its
  // selection over a caret the browser has placed and not reported yet.
  const { onContentChange, onReviewChange } = notifications;
  const latest = useRef({ events, onContentChange, onReviewChange, tap });
  useEffect(() => {
    latest.current = { events, onContentChange, onReviewChange, tap };
  });
  const withView = useMemo<EngineViewEvents>(
    () => ({
      onTransaction: (tr, current) => {
        latest.current.events?.onTransaction?.(tr, current);
        latest.current.tap?.(tr);
        publish(tr);
        const { onContentChange: notify, onReviewChange: review } = latest.current;
        if (notify && isContentChange(tr)) notify(tr, contentChangeCause(tr));
        const change = review && reviewChangeOf(tr);
        if (change) review(change, tr);
      },
      onSelectionChange: (selection, current) =>
        latest.current.events?.onSelectionChange?.(selection, current),
      onUpdated: (current, previous) => latest.current.events?.onUpdated?.(current, previous),
      afterCommit: (current) => latest.current.events?.afterCommit?.(current),
      onMounted: (mounted, shown = mounted) => {
        setView(mounted);
        latest.current.events?.onMounted?.(shown);
      },
      onUnmounted: () => {
        setView(null);
        latest.current.events?.onUnmounted?.();
      },
    }),
    [publish],
  );
  return { view, events: withView, transactions: feed };
}

/**
 * Renders nothing; placed before the engine, it has the view take the selection the browser shows
 * and has not reported yet before the engine draws a render that keeps the state, such as one for
 * the pages settling: the engine would draw the state's selection back over one a key extended a
 * moment before (DOCE-EDITOR-1.4). A render with a new state draws that state's selection.
 */
export function SelectionFirst({
  view,
  state,
}: {
  readonly view: EditorView | null;
  readonly state: EditorState;
}): null {
  const drawn = useRef(state);
  useLayoutEffect(() => {
    const kept = drawn.current === state;
    drawn.current = state;
    if (kept && view) readDomSelection(view);
  });
  return null;
}
