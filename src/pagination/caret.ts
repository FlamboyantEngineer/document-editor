// Keeps the caret where the writer sees it when a layout moves the pages: a line that moves onto
// the next page would otherwise jump by the space between pages, or out of view.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';

/** Where the caret is on screen before a layout: its top, when the editor has focus. */
export function caretPlace(view: EditorView): number | null {
  if (!view.hasFocus()) return null;
  try {
    return view.coordsAtPos(view.state.selection.head).top;
  } catch {
    return null;
  }
}

function scrolls(element: Element): boolean {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  const overflow = style?.overflowY ?? '';
  return /auto|scroll|overlay/.test(overflow) && element.scrollHeight > element.clientHeight;
}

// The element that scrolls the editor: its nearest scrolling ancestor, or the document's.
function scroller(view: EditorView): Element | null {
  for (let element = view.dom.parentElement; element; element = element.parentElement) {
    if (scrolls(element)) return element;
  }
  return view.dom.ownerDocument.scrollingElement;
}

/**
 * Scrolls the editor so the caret is back where it was on screen before a layout (`caretPlace`),
 * when the layout moved it.
 */
export function keepCaretInPlace(view: EditorView, before: number | null): void {
  const after = before === null ? null : caretPlace(view);
  if (before === null || after === null || Math.abs(after - before) < 1) return;
  const element = scroller(view);
  if (element) element.scrollTop += after - before;
}

// Where the caret was on screen before each laid-out document was taken, until it is drawn.
const caretBefore = new WeakMap<ProseMirrorNode, number | null>();

/**
 * Where the caret was on screen before the layout that made a document, once, so the view that
 * draws it can put the caret back there (DOCE-PAGINATION-5.8); null for none.
 */
export function takeCaretBefore(doc: ProseMirrorNode): number | null {
  const caret = caretBefore.get(doc) ?? null;
  caretBefore.delete(doc);
  return caret;
}

/** Records where the caret was on screen before the layout that made a document. */
export function rememberCaret(doc: ProseMirrorNode, caret: number | null): void {
  caretBefore.set(doc, caret);
}
