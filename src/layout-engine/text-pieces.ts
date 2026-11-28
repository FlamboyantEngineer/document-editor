// A text node as Pretext rich inline items: one item in its marks' font, cut where a citation's
// identifier or inserted text starts and ends (DOCE-PAGINATION-9.3, DOCE-REFERENCES-1.13).

import type { RichInlineItem } from '@chenglou/pretext/rich-inline';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { markedItem } from './code-boxes.js';
import { type BlockTypography, fontString, markedFont } from './typography.js';

function textItem(child: ProseMirrorNode, typography: BlockTypography): RichInlineItem {
  const font = fontString(markedFont(typography, child.marks));
  return markedItem({ text: child.text ?? child.textContent, font }, child.marks);
}

// A text node's pieces, cut where a citation's identifier starts and ends: each identifier piece
// is one unbreakable item, as the stylesheet keeps it whole (DOCE-REFERENCES-1.13), and is its own
// element on the line, as the identifier's decoration draws it.
export function textPieces(
  child: ProseMirrorNode,
  { offset, typography, identifiers, inserted }: PieceInput,
): { item: RichInlineItem; offset: number }[] {
  const item = textItem(child, typography);
  const end = offset + child.nodeSize;
  const inside = identifiers.filter(([from, to]) => from < end && to > offset);
  // Text inserted inside the node is drawn between two of its pieces.
  const between = inserted.filter((at) => at > offset && at < end);
  if (!inside.length && !between.length) return [{ item, offset }];
  const cuts = [...new Set([offset, ...inside.flat(), ...between, end])]
    .filter((cut) => cut >= offset && cut <= end)
    .sort((a, b) => a - b);
  const pieces: { item: RichInlineItem; offset: number }[] = [];
  for (let index = 0; index + 1 < cuts.length; index += 1) {
    const from = cuts[index] ?? offset;
    const to = cuts[index + 1] ?? end;
    const text = item.text.slice(from - offset, to - offset);
    const whole = inside.some(([start, stop]) => start <= from && to <= stop);
    pieces.push({ item: { ...item, text, ...(whole ? { break: 'never' } : {}) }, offset: from });
  }
  return pieces;
}

interface PieceInput {
  readonly offset: number;
  readonly typography: BlockTypography;
  /** The block's citation identifiers, as content ranges. */
  readonly identifiers: readonly (readonly [number, number])[];
  /** The offsets text is inserted at. */
  readonly inserted: readonly number[];
}
