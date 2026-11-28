// A code block's gutter of line numbers, which takes the code's width in from its left, as the
// reference stylesheet draws it (DOCE-PAGINATION-9.6).

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { textWidth } from './metrics.js';

/** The fewest digits a code gutter is wide for, and the room beside them (`document.css`). */
const GUTTER_DIGITS = 3;
const GUTTER_ROOM = 6 + 8;

/**
 * The width a code block's gutter of line numbers takes from its text: as many widths of the code
 * font's zero as its highest number has digits, at least three, and 14px more, truncated to the
 * layout unit as Chromium's padding is.
 */
export function codeGutterWidth(
  node: ProseMirrorNode,
  font: string,
  width: typeof textWidth,
): number {
  const start = Number(node.attrs.codeLineStart);
  const first = Number.isInteger(start) && start > 0 ? start : 1;
  const last = first + node.textContent.split('\n').length - 1;
  const digits = Math.max(GUTTER_DIGITS, String(last).length);
  return Math.floor((digits * width('0', font) + GUTTER_ROOM) * 64) / 64;
}
