// The elements a view draws blocks as, found by position or, for the children of one parent, by
// following the previous child's element, so a long parent is not searched from its start for each.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';

/** The element the node at a position is drawn as; null when it draws none. */
export function elementOf(view: EditorView, pos: number): HTMLElement | null {
  const dom = view.nodeDOM(pos);
  return dom && dom.nodeType === 1 ? (dom as HTMLElement) : null;
}

/**
 * The element a child is drawn as: the element after its previous sibling's when that one draws
 * it, otherwise the element found by its position.
 */
export function childElement(
  view: EditorView,
  previous: HTMLElement | null,
  { node, pos }: { readonly node: ProseMirrorNode; readonly pos: number },
): HTMLElement | null {
  // prosemirror-view and react-prosemirror both set `pmViewDesc` on the elements they draw.
  const next = previous?.nextElementSibling as (HTMLElement & { pmViewDesc?: unknown }) | null;
  const drawn = (next?.pmViewDesc as { node?: unknown } | undefined)?.node;
  return next && drawn === node ? next : elementOf(view, pos);
}
