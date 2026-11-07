// Splits a list of contents between its entries. The editor measures where each entry's row sits;
// a part shows a range of the entries, and the parts after the first show no title.

import type { LayoutBlock, SplitBlock } from './page-layout.js';

/** Where a row sits, measured from the top of its block. */
export interface RowLayout {
  readonly top: number;
  readonly bottom: number;
}

/** What the editor measured a list of contents from: one layout per entry row it shows. */
export interface RowsMeasurement {
  readonly rows: readonly RowLayout[];
}

function isRowsMeasurement(value: unknown): value is RowsMeasurement {
  return Array.isArray((value as Partial<RowsMeasurement> | null)?.rows);
}

/**
 * A list of contents split after the last entry whose row fits the height, or null when no row or
 * every row fits.
 */
export function splitContents(block: LayoutBlock, fitting: number): SplitBlock | null {
  if (!isRowsMeasurement(block.measurement)) return null;
  const { rows } = block.measurement;
  let fit = 0;
  while (fit < rows.length && (rows[fit]?.bottom ?? Number.POSITIVE_INFINITY) <= fitting) fit += 1;
  const next = rows[fit];
  const last = rows[fit - 1];
  if (!fit || !next || !last) return null;
  const { node } = block;
  const start = Number(node.attrs.entryStart) || 0;
  const split = start + fit;
  return {
    head: {
      ...block,
      node: node.type.create({ ...node.attrs, entryEnd: split }, null, node.marks),
      height: last.bottom,
      measurement: { rows: rows.slice(0, fit) },
    },
    tail: [
      {
        ...block,
        node: node.type.create(
          { ...node.attrs, entryStart: split, showTitle: false },
          null,
          node.marks,
        ),
        height: Math.max(1, block.height - next.top),
        leadLineHeight: null,
        breakBefore: true,
        measurement: {
          rows: rows
            .slice(fit)
            .map((row) => ({ top: row.top - next.top, bottom: row.bottom - next.top })),
        },
      },
    ],
  };
}
