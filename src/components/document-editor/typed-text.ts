// Typed text on the pages (DOCE-EDITOR-1.8): the view inserts what a key types itself, on the
// browser's `beforeinput`, rather than letting the browser write it into the page and reading the
// change back. Where the browser writes a character beside a fragment's edge depends on the
// browser, and a character it writes into a drawing the view ignores would be lost. Composition
// keeps the browser's own input.

import type { EditorView } from 'prosemirror-view';
import { readDomSelection } from '../../utils/dom-selection.js';

// The controls a host's node view may draw that take typing of their own.
const CONTROLS = 'input, textarea, select, [contenteditable]';

/**
 * The editable control an event's target is in, when it is one of its own inside `root`, such as a
 * text field a host's node view draws, and not `root`'s own editable content; null otherwise.
 */
export function ownControlOf(target: EventTarget | null, root: HTMLElement): Element | null {
  // Read by node type, which holds for nodes of any window.
  const node = target as Node | null;
  const element = node?.nodeType === 1 ? (node as Element) : (node?.parentElement ?? null);
  const control = element?.closest(CONTROLS);
  if (!control || control === root || !root.contains(control)) return null;
  return control.getAttribute('contenteditable') === 'false' ? null : control;
}

/**
 * Inserts a key's typed text through the view's text input handlers; whether it did. Text typed in
 * a control of its own, such as a host view's text field, is that control's.
 */
export function insertTypedText(view: EditorView, event: InputEvent): boolean {
  const text = event.data;
  if (event.inputType !== 'insertText' || !text || event.isComposing || view.composing) {
    return false;
  }
  if (ownControlOf(event.target, view.dom)) return false;
  // A click's caret the browser has not reported yet is where the text goes.
  readDomSelection(view);
  const { from, to } = view.state.selection;
  event.preventDefault();
  const insert = () => view.state.tr.insertText(text, from, to);
  const handled = view.someProp('handleTextInput', (handle) =>
    handle(view, from, to, text, insert),
  );
  if (!handled) view.dispatch(insert().scrollIntoView());
  return true;
}
