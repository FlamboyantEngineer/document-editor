// Stored table content from plain rows of text cells, the neutral shape other editors hand over,
// such as a range of a spreadsheet (DOCE-TABLES-4.1).

import type { StoredNode } from '../model/index.js';

/** One cell of a row: its text, and how many columns and rows it spans (1 by default). */
export interface TableRowCell {
  text: string;
  colspan?: number | undefined;
  rowspan?: number | undefined;
}

function span(value: number | undefined, name: string): number {
  const count = value ?? 1;
  if (!Number.isSafeInteger(count) || count < 1) {
    throw new RangeError(`A cell's ${name} must be a whole number of at least 1, not ${count}.`);
  }
  return count;
}

// A cell's text as paragraphs, one a line; an empty cell holds one empty paragraph.
function paragraphs(text: string): StoredNode[] {
  return text.split(/\r\n|\r|\n/).map((line) => ({
    type: 'paragraph',
    ...(line ? { content: [{ type: 'text', text: line }] } : {}),
  }));
}

interface SpannedCell {
  text: string;
  colspan: number;
  rowspan: number;
}

function storedCell({ text, colspan, rowspan }: SpannedCell): StoredNode {
  const attrs = { ...(colspan > 1 ? { colspan } : {}), ...(rowspan > 1 ? { rowspan } : {}) };
  return {
    type: 'tableCell',
    ...(Object.keys(attrs).length > 0 ? { attrs } : {}),
    content: paragraphs(text),
  };
}

// The rows that hold a cell of their own. A row whose cells all start above it, as a merge down a
// single column leaves it, is dropped, and the cells that spanned it span one row less.
function ownRows(rows: readonly (readonly TableRowCell[])[]): SpannedCell[][] {
  const kept: SpannedCell[][] = [];
  // The last row, as given, that each kept cell spans.
  const reach = new Map<SpannedCell, number>();
  rows.forEach((row, index) => {
    const cells = row.map((cell) => {
      const spanned = {
        text: cell.text,
        colspan: span(cell.colspan, 'colspan'),
        rowspan: span(cell.rowspan, 'rowspan'),
      };
      reach.set(spanned, index + spanned.rowspan - 1);
      return spanned;
    });
    if (cells.length > 0) kept.push(cells);
    else kept.flat().forEach((cell) => (reach.get(cell) ?? -1) >= index && (cell.rowspan -= 1));
  });
  return kept;
}

/**
 * A stored table of `rows`, each a list of the cells that start in it; a cell another cell's span
 * covers is left out of its row. The table carries no element ids: the editor and the stored-edit
 * functions give them as they insert it. Throws a `RangeError` for rows that hold no cell or a
 * span below 1.
 */
export function tableFromRows(rows: readonly (readonly TableRowCell[])[]): StoredNode {
  const cells = ownRows(rows);
  if (cells.length === 0) throw new RangeError('A table needs at least one cell.');
  return {
    type: 'table',
    content: cells.map((row) => ({ type: 'tableRow', content: row.map(storedCell) })),
  };
}
