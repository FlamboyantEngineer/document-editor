// Stored table content from plain rows of text cells, the neutral shape other editors hand over,
// such as a range of a spreadsheet (DOCE-TABLES-4.1).

import type { StoredNode } from '../model/index.js';
import { MAX_SPAN } from '../model/schema/table-nodes.js';

/** One cell of a row: its text, and how many columns and rows it spans (1 by default). */
export interface TableRowCell {
  text: string;
  colspan?: number | undefined;
  rowspan?: number | undefined;
}

function span(value: number | undefined, name: string): number {
  const count = value ?? 1;
  if (!Number.isSafeInteger(count) || count < 1 || count > MAX_SPAN) {
    throw new RangeError(
      `A cell's ${name} must be a whole number from 1 to ${MAX_SPAN}, not ${count}.`,
    );
  }
  return count;
}

function coverRow(
  cells: readonly TableRowCell[],
  { index, height }: { index: number; height: number },
  occupiedUntil: number[],
): void {
  let column = 0;
  for (const cell of cells) {
    const colspan = span(cell.colspan, 'colspan');
    const rowspan = span(cell.rowspan, 'rowspan');
    if (rowspan > height - index) throw new RangeError('A cell spans beyond the final row.');
    while ((occupiedUntil[column] ?? 0) > index) column += 1;
    const end = column + colspan;
    for (; column < end; column += 1) {
      if ((occupiedUntil[column] ?? 0) > index) throw new RangeError('Table cell spans overlap.');
      occupiedUntil[column] = index + rowspan;
    }
  }
}

function validateGrid(rows: readonly (readonly TableRowCell[])[]): void {
  const occupiedUntil: number[] = [];
  const widths: number[] = [];
  for (const [index, cells] of rows.entries()) {
    coverRow(cells, { index, height: rows.length }, occupiedUntil);
    if (!occupiedUntil.length || occupiedUntil.some((until) => until <= index))
      throw new RangeError('Every table row must be completely covered by cells.');
    widths.push(occupiedUntil.length);
  }
  if (widths.some((width) => width !== occupiedUntil.length))
    throw new RangeError('Table rows must have consistent widths.');
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
 * functions give them as they insert it. Throws a `RangeError` for empty tables, invalid spans,
 * or nonrectangular, overlapping or out-of-bounds grids.
 */
export function tableFromRows(rows: readonly (readonly TableRowCell[])[]): StoredNode {
  validateGrid(rows);
  const cells = ownRows(rows);
  if (cells.length === 0) throw new RangeError('A table needs at least one cell.');
  return {
    type: 'table',
    content: cells.map((row) => ({ type: 'tableRow', content: row.map(storedCell) })),
  };
}
