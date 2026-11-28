// The width of a character as the browser deletes and steps over it: a grapheme cluster, such as a
// flag, a family emoji or a letter with its accents, rather than one UTF-16 unit.

import type { ResolvedPos } from 'prosemirror-model';
import { clusterEnd, clusterStart } from '../layout-engine/graphemes.js';
import { atomAt } from '../layout-engine/inline-content.js';

/**
 * How many positions the character before (-1) or after (1) a position in a textblock takes: its
 * whole grapheme cluster or inline node, however long, within the textblock.
 */
export function characterWidth($pos: ResolvedPos, direction: -1 | 1): number {
  const block = $pos.parent;
  const at = $pos.parentOffset;
  const atom = atomAt(block, direction < 0 ? at - 1 : at);
  if (atom) return atom.to - atom.from;
  // An atom borders a text cluster even when its stand-in would join with a combining mark.
  if (direction < 0) {
    const from = clusterStart(block, at);
    return Math.max(1, at - (atomAt(block, from)?.to ?? from));
  }
  const to = clusterEnd(block, at);
  return Math.max(1, (atomAt(block, to - 1)?.from ?? to) - at);
}
