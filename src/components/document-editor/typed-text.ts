// Typed text on the pages (DOCE-EDITOR-1.8): the view inserts what a key types itself, on the
// browser's `beforeinput`, rather than letting the browser write it into the page and reading the
// change back. Where the browser writes a character beside a fragment's edge depends on the
// browser, and a character it writes into a drawing the view ignores would be lost. Composition
// keeps the browser's own input.

import type { EditorView } from 'prosemirror-view';
import { readDomSelection } from '../../utils/dom-selection.js';

/** Inserts a key's typed text through the view's text input handlers; whether it did. */
export function insertTypedText(view: EditorView, event: InputEvent): boolean {
  const text = event.data;
  if (event.inputType !== 'insertText' || !text || event.isComposing || view.composing) {
    return false;
  }
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
