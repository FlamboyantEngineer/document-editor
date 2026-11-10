// Taking the reader to an element of the document by its id: scrolling it to the top of the view,
// smoothly, without moving the selection unless asked.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';

/** How `revealElement` takes the reader to an element. */
export interface RevealOptions {
  /** Where the element comes to rest in the view. Defaults to `start`. */
  readonly align?: ScrollLogicalPosition | undefined;
  /** Defaults to `smooth`. */
  readonly behavior?: ScrollBehavior | undefined;
  /** Puts the caret at the element's start too. Defaults to false. */
  readonly select?: boolean | undefined;
}

// The first part of the element with an id, and its position.
function elementOf(
  doc: ProseMirrorNode,
  id: string,
): { node: ProseMirrorNode; pos: number } | null {
  let found: { node: ProseMirrorNode; pos: number } | null = null;
  doc.descendants((node, pos) => {
    if (found) return false;
    if (node.attrs.dataId === id) found = { node, pos };
    return !found;
  });
  return found;
}

/** Scrolls an element into view by its id; false when the document has no such element. */
export function revealElement(view: EditorView, id: string, options: RevealOptions = {}): boolean {
  const found = elementOf(view.state.doc, id);
  if (!found) return false;
  const dom = view.nodeDOM(found.pos);
  if (dom && 'scrollIntoView' in dom) {
    (dom as Element).scrollIntoView({
      block: options.align ?? 'start',
      behavior: options.behavior ?? 'smooth',
    });
  }
  if (options.select) {
    const selection = TextSelection.near(view.state.doc.resolve(found.pos + 1));
    view.dispatch(view.state.tr.setSelection(selection));
    view.focus();
  }
  return true;
}
