// The browser reports a click's or a key's new caret a moment after it moves, and ProseMirror reads
// it then. A state committed before that draws the old selection back over the new caret, so
// whatever commits a state the writer did not make, such as a layout or proofing results, first
// has the view read the selection the browser shows.

import type { EditorView } from 'prosemirror-view';

// The view's reader of DOM changes, which ProseMirror keeps internal.
interface ObservedView {
  readonly domObserver?: { flush(): void };
}

/** Has the view take the selection and changes the browser shows but has not reported yet. */
export function readDomSelection(view: EditorView): void {
  if (view.composing || view.isDestroyed) return;
  (view as unknown as ObservedView).domObserver?.flush();
}
