// The direction each forced block of the pages is drawn in (DOCE-PAGINATION-9.12), from the
// whole block's text so it keeps one direction across pages.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import {
  blockDirection,
  strongBlockDirection,
  type TextDirection,
} from '../layout-engine/direction.js';
import { textFragmentChains } from '../model/pagination/text-fragment-chains.js';

/** Whether a block is a later part of a split block. */
export const isContinued = (node: ProseMirrorNode) => Number(node.attrs.splitPartIndex ?? 0) > 0;

const kept = new WeakMap<ProseMirrorNode, ReadonlyMap<number, TextDirection>>();

/**
 * The direction of each part of a split text block in the pages' document, at any depth, by
 * position. It comes from the first strong character anywhere in the block.
 */
export function continuedDirections(doc: ProseMirrorNode): ReadonlyMap<number, TextDirection> {
  const found = kept.get(doc);
  if (found) return found;
  const directions = new Map<number, TextDirection>();
  doc.forEach((section, offset) => {
    for (const parts of textFragmentChains(section)) {
      let direction: TextDirection | null = null;
      for (const { node } of parts) {
        direction = strongBlockDirection(node);
        if (direction) break;
      }
      for (const { pos } of parts) directions.set(offset + 1 + pos, direction ?? 'ltr');
    }
  });
  kept.set(doc, directions);
  return directions;
}

/** The direction a forced block at a position is drawn in. */
export function drawnDirection(
  directions: ReadonlyMap<number, TextDirection>,
  { node, pos }: { readonly node: ProseMirrorNode; readonly pos: number },
): TextDirection {
  return directions.get(pos) ?? blockDirection(node);
}
