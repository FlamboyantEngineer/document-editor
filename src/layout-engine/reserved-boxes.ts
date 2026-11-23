// Reserved boxes: text the engine cannot measure reliably, such as a cluster no served font draws
// (the browser draws it from a system font whose width nothing predicts), takes a fixed width
// that the measurer and every renderer agree on. The measurer gives the cluster that width, the
// line table lists where such clusters are, and the pages, the viewer and print draw each one's
// real glyph centred in a box of exactly that width, so the layout never depends on the fallback.

/** A cluster drawn in a box of a fixed width, by content offset in its block. */
export interface ReservedBox {
  readonly from: number;
  readonly to: number;
  /** The box's width in CSS pixels at a zoom of 1. */
  readonly width: number;
}

/**
 * The width a grapheme cluster in a CSS font gets when it cannot be measured reliably; null when
 * it can. The measurer and the layout engine ask the same function, so they agree by construction.
 */
export type ReserveCluster = (cluster: string, font: string) => number | null;

/** The width a cluster no served face draws takes, in ems of its font size. */
export const UNSERVED_CLUSTER_EMS = 1;

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** The reserved boxes of a text at a content offset, in one font. */
export function reservedBoxes(
  text: string,
  { offset, font, reserve }: { offset: number; font: string; reserve: ReserveCluster },
): ReservedBox[] {
  const boxes: ReservedBox[] = [];
  for (const { segment, index } of graphemes.segment(text)) {
    const width = reserve(segment, font);
    if (width !== null)
      boxes.push({ from: offset + index, to: offset + index + segment.length, width });
  }
  return boxes;
}
