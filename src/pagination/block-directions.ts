// The direction each forced block of the pages is drawn in (DOCE-PAGINATION-9.11): its own, from
// its text, or a later part of a split block its first part's, so a paragraph keeps one direction
// across its pages whatever text its later parts start with.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { blockDirection, type TextDirection } from '../layout-engine/direction.js';

/** Whether a block is a later part of a split block. */
export const isContinued = (node: ProseMirrorNode) => Number(node.attrs.splitPartIndex ?? 0) > 0;

const kept = new WeakMap<ProseMirrorNode, ReadonlyMap<number, TextDirection>>();

/** The direction of each later part of a split block in the pages' document, by position. */
export function continuedDirections(doc: ProseMirrorNode): ReadonlyMap<number, TextDirection> {
  const found = kept.get(doc);
  if (found) return found;
  const firsts = new Map<string, TextDirection>();
  const directions = new Map<number, TextDirection>();
  doc.descendants((node, pos, parent) => {
    if (parent?.type.name !== 'page_content') return !node.isTextblock;
    if (!node.isTextblock) return false;
    const id = typeof node.attrs.dataId === 'string' ? node.attrs.dataId : null;
    if (!isContinued(node)) {
      if (id) firsts.set(id, blockDirection(node));
    } else directions.set(pos, (id ? firsts.get(id) : undefined) ?? blockDirection(node));
    return false;
  });
  kept.set(doc, directions);
  return directions;
}

/** The direction a forced block at a position is drawn in. */
export function drawnDirection(
  directions: ReadonlyMap<number, TextDirection>,
  { node, pos }: { readonly node: ProseMirrorNode; readonly pos: number },
): TextDirection {
  return (isContinued(node) ? directions.get(pos) : undefined) ?? blockDirection(node);
}
