// Tables as Word's: the template's border, a header row repeated on each page when the template
// repeats it, column widths, merged cells, cell backgrounds and vertical alignment, and the
// caption above or below as the template places it, numbered as the editor numbers it.

import { storedBodyOf, storedCaptionOf } from '../../schema/caption-content.js';
import type { StoredNode } from '../document-format.js';
import { keptContent } from '../left-out.js';
import { countObject } from './counting.js';
import { inlines, styledRun } from './inline.js';
import { paragraph, styled } from './paragraphs.js';
import { toTwips, toWordColor } from './word-xml.js';
import type { Writing } from './writing.js';

/** How a table writes the blocks of its cells. */
type CellBlocks = (content: readonly StoredNode[] | undefined, writing: Writing) => string;

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
  const columns = rows.reduce((max, row) => Math.max(max, row.content?.length ?? 0), grid.length);
  return Array.from({ length: Math.max(1, columns) }, (_, index) => grid[index] ?? 0);
}

/** The kinds of object Word captions, each in its own paragraph and label styles. */
type CaptionKind = 'figure' | 'table' | 'codeBlock';

/** Each kind's caption paragraph style and label character style, all based on Word's caption. */
const CAPTION_STYLES: Readonly<Record<CaptionKind, readonly [string, string]>> = {
  figure: ['Caption', 'CaptionLabel'],
  table: ['TableCaption', 'TableCaptionLabel'],
  codeBlock: ['CodeCaption', 'CodeCaptionLabel'],
};

/**
 * An object's caption with its numbered label, in its kind's styles; empty when it has neither. The
 * caption is written in its formats, with its footnotes and comments, its suggestions resolved as
 * any text's.
 */
export function captionParagraph(node: StoredNode, kind: CaptionKind, writing: Writing): string {
  const captioned = node.attrs?.captionEnabled !== false;
  const label = captioned ? countObject(writing.counting, kind) : '';
  const runs = captioned ? inlines(storedCaptionOf(node)?.content, writing) : '';
  if (!label && !runs) return '';
  const [style, labelStyle] = CAPTION_STYLES[kind];
  const lead = label ? styledRun(runs ? `${label} - ` : label, labelStyle) : '';
  const alignment = writing.counting.styles[kind]?.caption?.alignment;
  const justification = alignment ? `<w:jc w:val="${alignment}"/>` : '';
  return paragraph(lead + runs, styled(style, justification));
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
  /** The remaining vertical merges, by their starting grid column. */
  readonly merged: Map<number, { columns: number; remaining: number }>;
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
  const header = cell.type === 'tableHeader';
  const fill =
    toWordColor(cell.attrs?.background) ??
    (header ? toWordColor(placing.writing.counting.styles.table?.header?.background) : null);
  const vertical = VERTICAL[text(cell.attrs?.verticalAlign)];
  return [
    cellWidth(placing.grid, column, columns),
    columns > 1 ? `<w:gridSpan w:val="${String(columns)}"/>` : '',
    rows > 1 ? '<w:vMerge w:val="restart"/>' : '',
    fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : '',
    vertical ? `<w:vAlign w:val="${vertical}"/>` : '',
  ].join('');
}

function cellOf(cell: StoredNode, column: number, placing: Placing): string {
  const columns = span(cell.attrs?.colspan);
  const rows = span(cell.attrs?.rowspan);
  if (rows > 1) placing.merged.set(column, { columns, remaining: rows - 1 });
  const body = placing.blocks(cell.content, placing.writing) || paragraph('');
  // A header cell's paragraphs take the header style.
  const shown =
    cell.type === 'tableHeader'
      ? body.replace(/<w:p>(?!<w:pPr>)/g, '<w:p><w:pPr><w:pStyle w:val="TableHeader"/></w:pPr>')
      : body;
  return `<w:tc><w:tcPr>${cellProperties(cell, column, placing)}</w:tcPr>${shown}</w:tc>`;
}

function cellWidth(grid: readonly number[], column: number, columns: number): string {
  const width = grid.slice(column, column + columns).reduce((sum, value) => sum + value, 0);
  return width ? `<w:tcW w:w="${String(width)}" w:type="dxa"/>` : '<w:tcW w:w="0" w:type="auto"/>';
}

// A vertical continuation must cover the same grid columns as the cell that started it.
function writeContinuations(column: number, placing: Placing, written: string[]): number {
  for (let merge = placing.merged.get(column); merge; merge = placing.merged.get(column)) {
    const { columns } = merge;
    const size = cellWidth(placing.grid, column, columns);
    const span = columns > 1 ? `<w:gridSpan w:val="${String(columns)}"/>` : '';
    written.push(`<w:tc><w:tcPr>${size}${span}<w:vMerge/></w:tcPr><w:p/></w:tc>`);
    if (--merge.remaining === 0) placing.merged.delete(column);
    column += columns;
  }
  return column;
}

function rowOf(row: StoredNode, placing: Placing, repeat: boolean): string {
  const cells = keptContent(row.content, placing.writing.suggestions);
  const written: string[] = [];
  let column = 0;
  for (const cell of cells) {
    column = writeContinuations(column, placing, written);
    written.push(cellOf(cell, column, placing));
    column += span(cell.attrs?.colspan);
  }
  writeContinuations(column, placing, written);
  const header = repeat && cells.length > 0 && cells.every((cell) => cell.type === 'tableHeader');
  return `<w:tr>${header ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${written.join('')}</w:tr>`;
}

/** A table, with its caption where the template places it. */
export function writeTable(node: StoredNode, writing: Writing, blocks: CellBlocks): string {
  const settings = writing.counting.styles.table;
  const rows = keptContent(storedBodyOf(node), writing.suggestions);
  const grid = gridOf(rows);
  const placing: Placing = {
    writing: { ...writing, structural: false },
    blocks,
    grid,
    merged: new Map(),
  };
  const caption = captionParagraph(node, 'table', writing);
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
