// The editor's engine plumbing: the dispatch body that turns changes into suggestions and commits
// proofing results on the latest state, the engine's events kept stable across the host's renders,
// and the view props that read the browser's selection before keys and bind the find key.

import type { RichTextEngineEvents } from '@flamboyantengineer/ui-components/rich-text-editor';
import type { EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { useEffect, useMemo, useRef, useState } from 'react';
import { automationActor, proofingUpdate, suggestTransaction } from '../../engine/index.js';
import { readDomSelection } from '../../utils/dom-selection.js';
import { isContentChange } from './use-host-events.js';

/** What the plumbing reads of the editor's props. */
export interface EnginePlumbingProps {
  readonly onStateChange: (update: (state: EditorState) => EditorState) => void;
  readonly events?: Omit<RichTextEngineEvents, 'props'> | undefined;
  readonly onContentChange?:
    ((tr: Parameters<NonNullable<RichTextEngineEvents['onTransaction']>>[0]) => void) | undefined;
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
      // An automation change is direct or a suggestion as its caller chose.
      const next =
        suggesting && !automationActor(tr) ? suggestTransaction(tr, view.state, { author }) : tr;
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

// Mod-F: Ctrl+F, or Cmd+F on a Mac.
export const isFindKey = (event: KeyboardEvent) =>
  event.key.toLowerCase() === 'f' &&
  (event.ctrlKey || event.metaKey) &&
  !event.altKey &&
  !event.shiftKey;

// The caller's events, with the engine's view kept for the chrome that acts on it.
export function useEngineView(
  events: EnginePlumbingProps['events'],
  onContentChange: EnginePlumbingProps['onContentChange'],
) {
  const [view, setView] = useState<EditorView | null>(null);
  // The host's latest events, behind handlers that keep their identity: a new events object on
  // each of the host's renders would otherwise give the view new props, which redraws its
  // selection over a caret the browser has placed and not reported yet.
  const latest = useRef({ events, onContentChange });
  useEffect(() => {
    latest.current = { events, onContentChange };
  });
  const withView = useMemo<EngineEvents>(
    () => ({
      onTransaction: (tr, current) => {
        latest.current.events?.onTransaction?.(tr, current);
        const notify = latest.current.onContentChange;
        if (notify && isContentChange(tr)) notify(tr);
      },
      onSelectionChange: (selection, current) =>
        latest.current.events?.onSelectionChange?.(selection, current),
      onUpdated: (current, previous) => latest.current.events?.onUpdated?.(current, previous),
      afterCommit: (current) => latest.current.events?.afterCommit?.(current),
      onMounted: (mounted) => {
        setView(mounted);
        latest.current.events?.onMounted?.(mounted);
      },
      onUnmounted: () => {
        setView(null);
        latest.current.events?.onUnmounted?.();
      },
    }),
    [],
  );
  return { view, events: withView };
}
