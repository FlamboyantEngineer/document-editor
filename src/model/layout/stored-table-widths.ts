// Fitting the tables of stored content to a width, without the editor: a server composing a
// document puts tables brought in from elsewhere within its pages' content the way the editor keeps
// its own tables there (DOCE-TABLES-3.7).

import type { StoredNode } from '../format/document-format.js';
import { scaleColumns } from './column-widths.js';

const spanOf = (cell: StoredNode) => Math.max(1, Number(cell.attrs?.colspan) || 1);

// A table's column widths from its first row's cells; null while one is unset.
function widthsOf(table: StoredNode): number[] | null {
  const widths: number[] = [];
  for (const cell of table.content?.[0]?.content ?? []) {
    const colwidth = cell.attrs?.colwidth;
    if (!Array.isArray(colwidth) || colwidth.length !== spanOf(cell)) return null;
    if (!colwidth.every((width) => typeof width === 'number' && width > 0)) return null;
    widths.push(...(colwidth as number[]));
  }
  return widths.length ? widths : null;
}

// The table with each cell's widths taken from the fitted columns it spans.
function withWidths(table: StoredNode, widths: readonly number[]): StoredNode {
  const rows = (table.content ?? []).map((row) => {
    let column = 0;
    const cells = (row.content ?? []).map((cell) => {
      const span = spanOf(cell);
      const colwidth = widths.slice(column, column + span);
      column += span;
      return colwidth.length === span ? { ...cell, attrs: { ...cell.attrs, colwidth } } : cell;
    });
    return { ...row, content: cells };
  });
  return { ...table, content: rows };
}

/**
 * Stored content whose tables, at any depth, are no wider than `max` pixels: a wider table's
 * columns shrink in proportion (`scaleColumns`). Content without such a table is returned as is.
 */
export function fitStoredTables(content: readonly StoredNode[], max: number): StoredNode[] {
  return content.map((node) => {
    if (node.type === 'text' || !node.content) return node;
    const children = fitStoredTables(node.content, max);
    const same = children.every((child, index) => child === node.content?.[index]);
    const inner = same ? node : { ...node, content: children };
    if (node.type !== 'table') return inner;
    const widths = widthsOf(inner);
    if (!widths) return inner;
    const fitted = scaleColumns(widths, max);
    return fitted.every((width, index) => width === widths[index])
      ? inner
      : withWidths(inner, fitted);
  });
}
