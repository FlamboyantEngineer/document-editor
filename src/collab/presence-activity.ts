// What the reader is doing, for presence: the kind of their latest change (editing, reviewing or
// viewing), and whether they have yet placed themselves in the content. Until a person points,
// selects or types in the content their caret is not shared: opening the document, focusing it
// from code, scrolling, the toolbar and the others' changes do not place them anywhere.

import type { Transaction } from 'prosemirror-state';
import { AddMarkStep, RemoveMarkStep, type Step } from 'prosemirror-transform';
import type { EditorView } from 'prosemirror-view';
import type { PresenceActivity } from '../engine/presence.js';
import { suggestionsKey } from '../engine/suggestions.js';

const COMMENT_MARK = 'comment_highlight';

const isCommentStep = (step: Step) =>
  (step instanceof AddMarkStep || step instanceof RemoveMarkStep) &&
  step.mark.type.name === COMMENT_MARK;

/**
 * The activity a change of the reader's own is: reviewing for a suggestion, a decision on one or a
 * comment's anchor, editing for any other change to the content, and viewing for a selection.
 */
export function activityOf(tr: Transaction): PresenceActivity {
  if (tr.getMeta(suggestionsKey)) return 'reviewing';
  if (!tr.docChanged) return 'viewing';
  return tr.steps.every(isCommentStep) ? 'reviewing' : 'editing';
}

// The events that place the reader in the content, when the browser reports them as the reader's.
const PLACING = ['pointerdown', 'mousedown', 'touchstart', 'keydown', 'beforeinput'] as const;

// The events that tell the reader is reading on: scrolling by wheel or touch.
const SCROLLING = ['wheel', 'touchmove'] as const;

/** Whether the reader has placed themselves in the content, kept across the views of a session. */
export interface PlacementGate {
  placed: boolean;
}

const isTrusted = (event: Event) => event.isTrusted;

/**
 * Follows the reader's own input on a view: `onPlaced` once, after their first pointer, key or
 * text input in the content, and `onScroll` for each wheel or touch scroll over the editor. Only
 * events the browser reports as the reader's count (`isReader`, by default the browser's `isTrusted`), never events made by code.
 */
export function followReader(
  view: EditorView,
  gate: PlacementGate,
  {
    onPlaced,
    onScroll,
    isReader = isTrusted,
  }: { onPlaced: () => void; onScroll: () => void; isReader?: (event: Event) => boolean },
): () => void {
  const owner = view.dom.ownerDocument;
  const place = (event: Event) => {
    if (gate.placed || !isReader(event)) return;
    gate.placed = true;
    onPlaced();
  };
  // Over the editor: its content, or the margins and gaps around its pages.
  const scroll = (event: Event) => {
    const root = view.dom.closest('.de-document-editor') ?? view.dom;
    if (isReader(event) && root.contains(event.target as Node | null)) onScroll();
  };
  for (const type of PLACING) view.dom.addEventListener(type, place, { capture: true });
  for (const type of SCROLLING) {
    owner.addEventListener(type, scroll, { capture: true, passive: true });
  }
  return () => {
    for (const type of PLACING) view.dom.removeEventListener(type, place, { capture: true });
    for (const type of SCROLLING) owner.removeEventListener(type, scroll, { capture: true });
  };
}
