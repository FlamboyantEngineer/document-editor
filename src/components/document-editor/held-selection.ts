// The selection the document holds while focus is elsewhere on the page, such as in a host panel's
// text field: the browser stops drawing it there, so the editor draws it instead, a range as marked
// text and a caret as a mark at its place, until focus comes back to the document.

import { type EditorState, NodeSelection } from 'prosemirror-state';
import type { Decoration } from 'prosemirror-view';
import { type FocusEvent, useMemo, useState } from 'react';
import { viewOnlyInline, viewOnlyWidget } from '../../utils/view-only-decorations.js';

/** The hook class of the text a held selection covers. */
const HELD_RANGE_CLASS = 'de-held-selection';
/** The hook class of a held caret. */
const HELD_CARET_CLASS = 'de-held-caret';

/** The held selection's decorations: its ranges, or its caret. A selected node shows itself. */
export function heldSelectionDecorations(state: EditorState): Decoration[] {
  const { selection } = state;
  if (selection instanceof NodeSelection) return [];
  if (selection.empty) {
    return [
      viewOnlyWidget(
        selection.head,
        (view) => {
          const caret = view.dom.ownerDocument.createElement('span');
          caret.className = HELD_CARET_CLASS;
          caret.setAttribute('aria-hidden', 'true');
          return caret;
        },
        { side: 1, key: 'held-caret', ignoreSelection: true },
      ),
    ];
  }
  return selection.ranges
    .filter(({ $from, $to }) => $from.pos < $to.pos)
    .map(({ $from, $to }) =>
      viewOnlyInline({ from: $from.pos, to: $to.pos }, { class: HELD_RANGE_CLASS }),
    );
}

// The document's editable root an event's element is, or null.
const editableRoot = (target: EventTarget | null): Element | null => {
  const element = target as Element | null;
  if (element?.getAttribute('contenteditable') !== 'true') return null;
  return element.parentElement?.closest('[contenteditable="true"]') ? null : element;
};

// The kinds of input that take no text, focusing which leaves the document's selection shown.
const TEXTLESS_INPUTS = new Set([
  'button',
  'checkbox',
  'radio',
  'range',
  'color',
  'file',
  'image',
  'reset',
  'submit',
]);

// Whether focus going to an element takes the page's selection with it: a text field, or other
// editable text.
function takesSelection(next: Element): boolean {
  const name = next.tagName.toLowerCase();
  if (name === 'textarea') return true;
  if (name === 'input')
    return !TEXTLESS_INPUTS.has((next.getAttribute('type') ?? 'text').toLowerCase());
  return next.closest('[contenteditable="true"]') !== null;
}

/**
 * Whether the document's selection is held: focus left the document for a text field elsewhere on
 * the page, where the browser stops showing it, and has not come back. The handlers go on the
 * element holding the document.
 */
export function useHeldSelection() {
  const [held, setHeld] = useState(false);
  const handlers = useMemo(
    () => ({
      onBlur(event: FocusEvent) {
        const root = editableRoot(event.target);
        const next = event.relatedTarget as Element | null;
        if (root && next && !root.contains(next) && takesSelection(next)) setHeld(true);
      },
      onFocus(event: FocusEvent) {
        if (editableRoot(event.target)) setHeld(false);
      },
    }),
    [],
  );
  return { held, handlers };
}
