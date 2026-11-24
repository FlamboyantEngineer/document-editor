// Tables: every cell laid out in its columns' width, each row as tall as its tallest cell, a cell
// that spans rows growing the last of them, and a table with its caption above or below it. Rows
// are measured as the table splitter reads them (DOCE-PAGINATION-10.5).

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { TableMap } from 'prosemirror-tables';
import { isContainerMeasurement, type LayoutBlock } from '../../model/index.js';
import { type BlockContext, isLaid, type Laid, laid, layChildren, notLaid } from './context.js';
import { stackContainer } from './stack.js';
import { type TableBorders, tableBorders, tableColumns } from './table-columns.js';
import { continuedCaptionGrowth, layTextBlock } from './text-blocks.js';

interface PlacedCell {
  readonly top: number;
  readonly bottom: number;
  /** The cell's height, its padding and the halves of its borders included. */
  readonly height: number;
}

interface CellBox {
  readonly padding: number;
  readonly borders: TableBorders;
}

// A cell's content width: its columns' less its padding and the halves of its side borders.
function cellHeight(
  context: BlockContext,
  cell: ProseMirrorNode,
  { width, box }: { width: number; box: CellBox },
): { height: number; provisional: boolean } | Laid {
  const inner = Math.max(0, width - 2 * box.padding - box.borders.vertical);
  const children = layChildren(context, cell, { width: inner, parent: 'cell' });
  if (isLaid(children)) return children;
  const edge = box.padding + box.borders.horizontal / 2;
  const stacked = stackContainer(children.blocks, {
    marginTop: 0,
    marginBottom: 0,
    top: edge,
    bottom: edge,
    contains: true,
  });
  const own = Number(cell.attrs.rowHeight);
  const minimum = Number.isFinite(own) && own > 0 ? own + 2 * edge : 0;
  return { height: Math.max(stacked.height, minimum), provisional: children.provisional };
}

// Each row's height: its single-row cells' tallest, then a cell spanning rows adds what it lacks
// to the last row it spans.
function rowHeights(cells: readonly PlacedCell[], count: number): number[] {
  const heights = Array.from({ length: count }, () => 0);
  for (const cell of cells) {
    if (cell.bottom - cell.top === 1) {
      heights[cell.top] = Math.max(heights[cell.top] ?? 0, cell.height);
    }
  }
  for (const cell of cells) {
    if (cell.bottom - cell.top <= 1) continue;
    const spanned = heights.slice(cell.top, cell.bottom).reduce((sum, height) => sum + height, 0);
    const last = cell.bottom - 1;
    if (cell.height > spanned) heights[last] = (heights[last] ?? 0) + cell.height - spanned;
  }
  return heights;
}

/** A table's height and where each row sits, in the width its place gives it. */
function layTable(context: BlockContext, table: ProseMirrorNode): Laid {
  const { metrics, place } = context;
  const map = TableMap.get(table);
  const borders = tableBorders(table, metrics.table.border);
  const inRegion = place.region === 'header' || place.region === 'footer';
  const box = { padding: inRegion ? 0 : metrics.table.cellPadding, borders };
  const columns = tableColumns(table, { available: place.width, borders, count: map.width });
  const cells: PlacedCell[] = [];
  const seen = new Set<number>();
  let provisional = false;
  for (const pos of map.map) {
    if (seen.has(pos)) continue;
    seen.add(pos);
    const cell = table.nodeAt(pos);
    if (!cell) return notLaid(table, 'a table cell is missing from its map');
    const rect = map.findCell(pos);
    const width = columns.widths
      .slice(rect.left, rect.right)
      .reduce((sum, column) => sum + column, 0);
    const result = cellHeight(context, cell, { width, box });
    if ('ok' in result) return result;
    provisional ||= result.provisional;
    cells.push({ top: rect.top, bottom: rect.bottom, height: result.height });
  }
  const heights = rowHeights(cells, map.height);
  let top = 0;
  const rows = heights.map((height) => {
    const row = { top, bottom: top + height };
    top = row.bottom;
    return row;
  });
  const block: LayoutBlock = {
    node: table,
    height: top + borders.horizontal,
    marginTop: 0,
    marginBottom: 0,
    measurement: { children: rows },
  };
  return laid(block, provisional);
}

/** The width a table takes in its place, its outer border included. */
function tableWidth(context: BlockContext, table: ProseMirrorNode): number {
  const borders = tableBorders(table, context.metrics.table.border);
  const count = TableMap.get(table).width;
  return tableColumns(table, { available: context.place.width, borders, count }).width;
}

// A table's rows with its caption's box, which a later part opening with a body row does not show,
// and how much taller a later part's caption is.
function withCaption(
  measurement: unknown,
  { caption, continuedCaption }: { caption: number; continuedCaption: number },
): unknown {
  if (caption <= 0 || !isContainerMeasurement(measurement)) return measurement;
  return { ...measurement, caption, ...(continuedCaption ? { continuedCaption } : {}) };
}

/**
 * A table with its caption: the caption above or below it, as wide as the table, measured by the
 * table's rows for the held split.
 */
export function layTableFigure(context: BlockContext, figure: ProseMirrorNode): Laid {
  const caption = figure.firstChild;
  const table = figure.lastChild;
  if (figure.childCount !== 2 || !caption || !table) {
    return notLaid(figure, 'a table figure holds a caption and a table');
  }
  const laidTable = layTable(context, table);
  if (!laidTable.ok) return laidTable;
  let captionHeight = 0;
  let continuedCaption = 0;
  if (table.attrs.captionEnabled !== false) {
    const width = tableWidth(context, table);
    const own = { ...context, place: { ...context.place, width } };
    const line = layTextBlock(own, caption);
    if (!line.ok) return line;
    captionHeight = line.block.height + 2 * context.metrics.table.captionPadding;
    continuedCaption = continuedCaptionGrowth(own, caption, line.block.height);
  }
  return laid(
    {
      node: figure,
      height: captionHeight + laidTable.block.height,
      marginTop: 0,
      marginBottom: context.metrics.paragraphAfter,
      measurement: withCaption(laidTable.block.measurement, {
        caption: captionHeight,
        continuedCaption,
      }),
    },
    laidTable.provisional,
  );
}
