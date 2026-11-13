// Tables as Word's: the template's border, a header row repeated on each page when the template
// repeats it, column widths, merged cells, cell backgrounds and vertical alignment, and the
// caption above or below as the template places it, numbered as the editor numbers it.

import type { StoredNode } from '../document-format.js';
import { keptContent } from '../left-out.js';
import { countObject } from './counting.js';
import { styledRun } from './inline.js';
import { paragraph, styled } from './paragraphs.js';
import { toTwips, toWordColor } from './word-xml.js';
import type { Writing } from './writing.js';

/** How a table writes the blocks of its cells. */
export type CellBlocks = (content: readonly StoredNode[] | undefined, writing: Writing) => string;

const text = (value: unknown) => (typeof value === 'string' ? value : '');

const span = (value: unknown) => {
  const count = Number(value);
  return Number.isInteger(count) && count > 1 ? Math.min(count, 1000) : 1;
};

// A cell's column widths in twips, one per column it spans; empty when it sets none.
function widthsOf(cell: StoredNode): number[] {
  const widths = cell.attrs?.colwidth;
  return Array.isArray(widths) ? widths.map((width) => Math.round(Number(width) * 15) || 0) : [];
}

function gridOf(rows: readonly StoredNode[]): number[] {
  const first = rows[0]?.content ?? [];
  const grid = first.flatMap((cell) => {
    const widths = widthsOf(cell);
    return Array.from({ length: span(cell.attrs?.colspan) }, (_, index) => widths[index] ?? 0);
  });
  const columns = Math.max(grid.length, ...rows.map((row) => row.content?.length ?? 0));
  return Array.from({ length: Math.max(1, columns) }, (_, index) => grid[index] ?? 0);
}

/** A table's caption with its numbered label; empty when it has neither. */
export function captionParagraph(
  label: string,
  caption: string,
  alignment?: string | null,
): string {
  if (!label && !caption) return '';
  const lead = label ? styledRun(caption ? `${label} - ` : label, 'CaptionLabel') : '';
  const justification = alignment ? `<w:jc w:val="${alignment}"/>` : '';
  return paragraph(
    lead + (caption ? styledRun(caption, 'Caption') : ''),
    styled('Caption', justification),
  );
}

function tableProperties(writing: Writing): string {
  const border = writing.counting.styles.table?.border;
  const size = Math.max(2, Math.round(((toTwips(border?.width) ?? 15) / 20) * 8));
  const color = toWordColor(border?.color) ?? 'auto';
  const side = (name: string) =>
    `<w:${name} w:val="single" w:sz="${String(size)}" w:space="0" w:color="${color}"/>`;
  const borders = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(side).join('');
  return `<w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>${borders}</w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr>`;
}

interface Placing {
  readonly writing: Writing;
  readonly blocks: CellBlocks;
  readonly grid: readonly number[];
  /** The rows each grid column is still merged down for. */
  readonly merged: number[];
}

const VERTICAL: Readonly<Record<string, string>> = {
  top: 'top',
  middle: 'center',
  bottom: 'bottom',
};

// A cell's properties: its width, spans, background and vertical alignment.
function cellProperties(cell: StoredNode, column: number, placing: Placing): string {
  const columns = span(cell.attrs?.colspan);
  const rows = span(cell.attrs?.rowspan);
  const width = placing.grid.slice(column, column + columns).reduce((sum, value) => sum + value, 0);
  const header = cell.type === 'tableHeader';
  const fill =
    toWordColor(cell.attrs?.background) ??
    (header ? toWordColor(placing.writing.counting.styles.table?.header?.background) : null);
  const vertical = VERTICAL[text(cell.attrs?.verticalAlign)];
  return [
    width ? `<w:tcW w:w="${String(width)}" w:type="dxa"/>` : '<w:tcW w:w="0" w:type="auto"/>',
    columns > 1 ? `<w:gridSpan w:val="${String(columns)}"/>` : '',
    rows > 1 ? '<w:vMerge w:val="restart"/>' : '',
    fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : '',
    vertical ? `<w:vAlign w:val="${vertical}"/>` : '',
  ].join('');
}

function cellOf(cell: StoredNode, column: number, placing: Placing): string {
  const columns = span(cell.attrs?.colspan);
  const rows = span(cell.attrs?.rowspan);
  for (let index = column; index < column + columns; index += 1) placing.merged[index] = rows - 1;
  const body = placing.blocks(cell.content, placing.writing) || paragraph('');
  // A header cell's paragraphs take the header style.
  const shown =
    cell.type === 'tableHeader'
      ? body.replace(/<w:p>(?!<w:pPr>)/g, '<w:p><w:pPr><w:pStyle w:val="TableHeader"/></w:pPr>')
      : body;
  return `<w:tc><w:tcPr>${cellProperties(cell, column, placing)}</w:tcPr>${shown}</w:tc>`;
}

// A cell that continues a merge from the row above, for each grid column still merged.
function continuedCell(column: number, placing: Placing): string {
  placing.merged[column] = (placing.merged[column] ?? 1) - 1;
  const width = placing.grid[column] ?? 0;
  const size = width
    ? `<w:tcW w:w="${String(width)}" w:type="dxa"/>`
    : '<w:tcW w:w="0" w:type="auto"/>';
  return `<w:tc><w:tcPr>${size}<w:vMerge/></w:tcPr><w:p/></w:tc>`;
}

function rowOf(row: StoredNode, placing: Placing, repeat: boolean): string {
  const cells = keptContent(row.content, placing.writing.suggestions);
  const written: string[] = [];
  let column = 0;
  for (const cell of cells) {
    while ((placing.merged[column] ?? 0) > 0) written.push(continuedCell(column++, placing));
    written.push(cellOf(cell, column, placing));
    column += span(cell.attrs?.colspan);
  }
  while (column < placing.grid.length && (placing.merged[column] ?? 0) > 0) {
    written.push(continuedCell(column++, placing));
  }
  const header = repeat && cells.length > 0 && cells.every((cell) => cell.type === 'tableHeader');
  return `<w:tr>${header ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${written.join('')}</w:tr>`;
}

/** A table, with its caption where the template places it. */
export function writeTable(node: StoredNode, writing: Writing, blocks: CellBlocks): string {
  const settings = writing.counting.styles.table;
  const rows = keptContent(node.content, writing.suggestions);
  const grid = gridOf(rows);
  const placing: Placing = { writing: { ...writing, structural: false }, blocks, grid, merged: [] };
  const captioned = node.attrs?.captionEnabled !== false;
  const label = captioned ? countObject(writing.counting, 'table') : '';
  const caption = captionParagraph(
    label,
    captioned ? text(node.attrs?.caption) : '',
    settings?.caption?.alignment,
  );
  // Header rows repeat while they lead the table.
  let leading = settings?.repeatHeader !== false;
  const body = rows.map((row) => {
    const written = rowOf(row, placing, leading);
    leading &&= written.startsWith('<w:tr><w:trPr><w:tblHeader/>');
    return written;
  });
  const table = [
    `<w:tbl>${tableProperties(writing)}`,
    `<w:tblGrid>${grid.map((width) => (width ? `<w:gridCol w:w="${String(width)}"/>` : '<w:gridCol/>')).join('')}</w:tblGrid>`,
    ...body,
    '</w:tbl>',
  ].join('');
  return settings?.caption?.placement === 'below' ? table + caption : caption + table;
}
