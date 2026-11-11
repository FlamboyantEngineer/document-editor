// The editor's notifications to its host, beside the engine's: the selection moving, focus coming
// and going, and the writer's changes to the content, without the editor's own layouts and marks.
// And the host's own keys, which run before the editor's.

import { keydownHandler } from 'prosemirror-keymap';
import type { Command, EditorState, Selection, Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { useEffect, useMemo, useRef } from 'react';
import {
  proofingKey,
  type RegionChange,
  repairElementIds,
  type Suggestion,
} from '../../engine/index.js';
import { isPaginationTransaction } from '../../pagination/index.js';
import { readDomSelection } from '../../utils/dom-selection.js';
import type { ChangeBar } from './use-change-notifications.js';

/** What the editor tells its host. */
export interface DocumentEditorNotifications {
  /** The selection moved, by the writer or a change. */
  readonly onSelectionChange?: ((selection: Selection, state: EditorState) => void) | undefined;
  /** The document took or lost focus. */
  readonly onFocusChange?: ((focused: boolean) => void) | undefined;
  /**
   * The document's content changed: every change but the editor's own layouts of the pages and
   * proofing marks, such as to save it.
   */
  readonly onContentChange?: ((tr: Transaction) => void) | undefined;
  /** The pages are laid out for the first time, or the web layout shows: the editor is ready. */
  readonly onLayoutReady?: (() => void) | undefined;
  /** The document's suggestions changed: added, decided, edited or discussed. */
  readonly onSuggestionsChange?: ((suggestions: readonly Suggestion[]) => void) | undefined;
  /** The change bars a comparison draws changed, measured on their pages (`ChangeBar`). */
  readonly onChangeBarsChange?: ((bars: readonly ChangeBar[]) => void) | undefined;
  /**
   * Makes the pages' headers and footers editable in place, as a template editor does: each edit
   * shows on every page of its section and is handed here to write into the template.
   */
  readonly onRegionChange?: ((change: RegionChange) => void) | undefined;
  /** The host's own keys, such as `Mod-s`, which run before the editor's. */
  readonly keymap?: Readonly<Record<string, Command>> | undefined;
}

/** Whether a transaction changes the document's content, rather than its layout or marks. */
export function isContentChange(tr: Transaction): boolean {
  return tr.docChanged && !isPaginationTransaction(tr) && !tr.getMeta(proofingKey);
}

/** Calls the host's selection notification as the shown selection changes. */
export function useSelectionNotification(
  state: EditorState,
  onSelectionChange: DocumentEditorNotifications['onSelectionChange'],
) {
  const last = useRef<Selection | null>(null);
  useEffect(() => {
    if (!onSelectionChange || last.current?.eq(state.selection)) return;
    last.current = state.selection;
    onSelectionChange(state.selection, state);
  }, [state, onSelectionChange]);
}

// The view's pointer press, which ProseMirror keeps internal.
interface PressedView {
  readonly input?: { readonly mouseDown?: unknown };
}

// Tells the host once the click that moved focus has placed the caret and the view has read it:
// a host that renders as focus moves, mid-click, would otherwise redraw the old selection over the
// caret the click is placing.
function afterClick(view: EditorView, notify: () => void) {
  const owner = view.dom.ownerDocument.defaultView;
  if (!owner) return;
  const later = () =>
    owner.setTimeout(() => {
      readDomSelection(view);
      notify();
    }, 0);
  if ((view as unknown as PressedView).input?.mouseDown) {
    owner.addEventListener('mouseup', later, { once: true });
  } else later();
}

/** The view props the notifications and the host's keys need. */
export function useHostViewProps(host: DocumentEditorNotifications) {
  const { onFocusChange, keymap } = host;
  return useMemo(() => {
    const keys = keymap ? keydownHandler(keymap) : null;
    return {
      handleKeyDown: keys
        ? (view: EditorView, event: KeyboardEvent) => keys(view, event)
        : undefined,
      focus: onFocusChange
        ? (view: EditorView) => {
            afterClick(view, () => onFocusChange(true));
            return false;
          }
        : undefined,
      blur: onFocusChange ? () => (onFocusChange(false), false) : undefined,
    };
  }, [onFocusChange, keymap]);
}

/** Repairs the element ids of the document a view opens with, once per document it is given. */
export function useElementIdRepair(view: EditorView | null, state: EditorState) {
  const { plugins } = state;
  useEffect(() => {
    if (!view) return;
    const tr = repairElementIds(view.state);
    if (tr) view.dispatch(tr);
  }, [view, plugins]);
}

/**
 * Calls the host once when the editor is first laid out: on the first layout of its pages, which
 * the returned tap sees, or when the editor signals that it shows the web layout.
 */
export function useLayoutReady(onLayoutReady: (() => void) | undefined) {
  const ready = useRef(false);
  const latest = useRef(onLayoutReady);
  useEffect(() => {
    latest.current = onLayoutReady;
  });
  return useMemo(() => {
    const signal = () => {
      if (ready.current) return;
      ready.current = true;
      latest.current?.();
    };
    return {
      signal,
      tap: (tr: Transaction) => {
        if (isPaginationTransaction(tr)) signal();
      },
    };
  }, []);
}
