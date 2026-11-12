// Taking the reader to an element of the document by its id, or to a range of its text: scrolling
// it to the top of the view, smoothly, without moving the selection unless asked. And the address
// of the selection, an element id with offsets in its text, which a host keeps to come back to.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { type EditorState, TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { type EditAddress, textOf, textRange } from './automation-address.js';

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

// The offset in a text block's text of a position in it.
function offsetOf(block: { node: ProseMirrorNode; pos: number }, pos: number): number {
  const { text, positions } = textOf(block);
  const index = positions.findIndex((each) => each >= pos);
  return index < 0 ? text.length : index;
}

const idOf = (node: ProseMirrorNode) =>
  typeof node.attrs.dataId === 'string' && node.attrs.dataId ? node.attrs.dataId : null;

/**
 * The selection's address: the text block holding it, by element id, with the selection's
 * offsets in its text; for a selection across blocks, the nearest element holding both, without
 * offsets; null when no element with an id holds it.
 */
export function selectionAddress(state: EditorState): EditAddress | null {
  const { $from, $to, from, to } = state.selection;
  const block = $from.parent;
  const id = idOf(block);
  if ($from.sameParent($to) && block.isTextblock && id) {
    const found = { node: block, pos: $from.before() };
    return { elementId: id, from: offsetOf(found, from), to: offsetOf(found, to) };
  }
  for (let depth = $from.sharedDepth(to); depth > 0; depth -= 1) {
    const shared = idOf($from.node(depth));
    if (shared) return { elementId: shared };
  }
  return null;
}

/**
 * Scrolls a range of an element's text into view by its address (`selectionAddress`), selecting
 * it when asked; false when the document has no such element or text range.
 */
export function revealRange(
  view: EditorView,
  address: EditAddress,
  options: RevealOptions = {},
): boolean {
  const found = elementOf(view.state.doc, address.elementId);
  if (!found) return false;
  const range = found.node.isTextblock
    ? textRange(found, address)
    : { from: found.pos, to: found.pos + found.node.nodeSize };
  if (!range) return false;
  const { node } = view.domAtPos(range.from);
  const element = node.nodeType === 1 ? (node as Element) : node.parentElement;
  if (element && 'scrollIntoView' in element) {
    element.scrollIntoView({
      block: options.align ?? 'start',
      behavior: options.behavior ?? 'smooth',
    });
  }
  if (options.select) {
    const selection = TextSelection.between(
      view.state.doc.resolve(range.from),
      view.state.doc.resolve(range.to),
    );
    view.dispatch(view.state.tr.setSelection(selection));
    view.focus();
  }
  return true;
}
