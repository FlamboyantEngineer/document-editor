// A table as a GitHub table. Markdown has no merged cells, so a cell that spans columns or rows is
// written in its first place and the places it covers are left empty, keeping every row as wide
// as the table and every column where it belongs.

import type { StoredNode } from '../document-format.js';
import { escapeText } from './escape.js';
import { text, type Writing } from './writing.js';

/** Writes a run of blocks as Markdown, one string for each block written. */
export type BlocksWriter = (
  content: readonly StoredNode[] | undefined,
  writing: Writing,
) => string[];

const span = (value: unknown) => (typeof value === 'number' && value > 1 ? Math.floor(value) : 1);

// The table's rows as a grid of cell texts, with a merged cell's other places empty.
function grid(node: StoredNode, writing: Writing, blocks: BlocksWriter): string[][] {
  const inTable: Writing = { ...writing, inTable: true };
  // How many more rows each column is covered by a cell above that spans rows.
  const covered: number[] = [];
  return (node.content ?? []).map((row) => {
    const cells: string[] = [];
    let column = 0;
    const skipCovered = () => {
      while ((covered[column] ?? 0) > 0) {
        covered[column] = (covered[column] ?? 1) - 1;
        cells[column] = '';
        column += 1;
      }
    };
    for (const cell of row.content ?? []) {
      skipCovered();
      cells[column] = blocks(cell.content, inTable).join('<br>').replace(/\n+/g, ' ').trim();
      const columns = span(cell.attrs?.colspan);
      const rows = span(cell.attrs?.rowspan);
      for (let offset = 0; offset < columns; offset += 1) {
        if (offset > 0) cells[column + offset] = '';
        covered[column + offset] = rows - 1;
      }
      column += columns;
    }
    // The places after the row's last cell that cells above still cover.
    for (; column < covered.length; column += 1) skipCovered();
    return cells;
  });
}

/** A table as a GitHub table, its first row the header, with its caption above. */
export function tableOf(node: StoredNode, writing: Writing, blocks: BlocksWriter): string {
  const rows = grid(node, writing, blocks);
  const width = Math.max(1, ...rows.map((row) => row.length));
  const line = (cells: readonly string[]) =>
    `| ${Array.from({ length: width }, (_, index) => cells[index] ?? '').join(' | ')} |`;
  const [head = [], ...body] = rows;
  const caption = text(node.attrs?.caption);
  return [
    ...(caption ? [`*${escapeText(caption)}*`, ''] : []),
    line(head),
    `|${' --- |'.repeat(width)}`,
    ...body.map(line),
  ].join('\n');
}
