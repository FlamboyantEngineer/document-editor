// The width of a character as the browser deletes and steps over it: a grapheme cluster, such as a
// flag, a family emoji or a letter with its accents, rather than one UTF-16 unit.

import type { ResolvedPos } from 'prosemirror-model';
import {
  clusterEnd,
  clusterStart,
  OBJECT_CHARACTER,
  positionText,
} from '../layout-engine/graphemes.js';

/**
 * How many positions the character before (-1) or after (1) a position in a textblock takes: its
 * whole grapheme cluster, however long, within the textblock; 1 where an inline node stands next
 * to it.
 */
export function characterWidth($pos: ResolvedPos, direction: -1 | 1): number {
  const block = $pos.parent;
  const at = $pos.parentOffset;
  const [from, to] = direction < 0 ? [clusterStart(block, at), at] : [at, clusterEnd(block, at)];
  if (from === to) return 1;
  return positionText(block, from, to).includes(OBJECT_CHARACTER) ? 1 : to - from;
}
