// Fitting the tables of stored content to a width, without the editor: a server composing a
// document puts tables brought in from elsewhere within its pages' content the way the editor keeps
// its own tables there (DOCE-TABLES-3.7).

import type { StoredNode } from '../format/document-format.js';
import { storedBodyOf } from '../schema/caption-content.js';
import { MAX_SPAN } from '../schema/table-nodes.js';
import { fillColumns, scaleColumns } from './column-widths.js';

const spanOf = (value: unknown) =>
  typeof value === 'number' && Number.isInteger(value) && value > 1 ? Math.min(MAX_SPAN, value) : 1;

// A table's column widths from its first row's cells; null while one is unset.
function widthsOf(table: StoredNode): number[] | null {
  const widths: number[] = [];
  for (const cell of storedBodyOf(table)[0]?.content ?? []) {
    const colwidth = cell.attrs?.colwidth;
    if (!Array.isArray(colwidth) || colwidth.length !== spanOf(cell.attrs?.colspan)) return null;
    if (
      !colwidth.every((width) => typeof width === 'number' && Number.isFinite(width) && width > 0)
    ) {
      return null;
    }
    widths.push(...(colwidth as number[]));
  }
  return widths.length ? widths : null;
}

// Each cell takes the widths of its logical columns, skipping cells spanning from rows above.
function withWidths(table: StoredNode, widths: readonly number[]): StoredNode {
  const covered: number[] = [];
  const content = (table.content ?? []).map((row) => {
    if (row.type !== 'tableRow') return row;
    let column = 0;
    const cells = (row.content ?? []).map((cell) => {
      while ((covered[column] ?? 0) > 0) column += 1;
      const span = spanOf(cell.attrs?.colspan);
      const colwidth = widths.slice(column, column + span);
      const rowspan = spanOf(cell.attrs?.rowspan);
      for (let each = column; each < column + span; each += 1) covered[each] = rowspan;
      column += span;
      return colwidth.length === span ? { ...cell, attrs: { ...cell.attrs, colwidth } } : cell;
    });
    covered.forEach((rows, index) => (covered[index] = rows - 1));
    return { ...row, content: cells };
  });
  return { ...table, content };
}

/**
 * Stored content whose tables, at any depth, are no wider than `max` pixels: a wider table's
 * columns shrink in proportion (`scaleColumns`). Content without such a table is returned as is.
 * With `fill`, each top-level table's columns fill `max` exactly in proportion (`fillColumns`),
 * narrower tables widening too; nested tables only shrink.
 */
export function fitStoredTables(
  content: readonly StoredNode[],
  max: number,
  fill = false,
): StoredNode[] {
  return content.map((node) => {
    if (node.type === 'text' || !node.content) return node;
    const children = fitStoredTables(node.content, max);
    const same = children.every((child, index) => child === node.content?.[index]);
    const inner = same ? node : { ...node, content: children };
    if (node.type !== 'table') return inner;
    const widths = widthsOf(inner);
    if (!widths) return inner;
    const fitted = fill ? fillColumns(widths, max) : scaleColumns(widths, max);
    return fitted.every((width, index) => width === widths[index])
      ? inner
      : withWidths(inner, fitted);
  });
}
