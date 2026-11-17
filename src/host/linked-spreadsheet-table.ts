import { tableFromRows } from '../document/stored-table.js';
import type { StoredNode } from '../model/format/document-format.js';
import type { LinkedSpreadsheetCapture } from './linked-spreadsheet.js';

type Rows = LinkedSpreadsheetCapture['table']['rows'];
type Cell = Rows[number][number];

const optional = (value: unknown, type: 'boolean' | 'string') =>
  value === undefined || typeof value === type;

function checkCell(cell: Cell): void {
  if (
    typeof cell !== 'object' ||
    cell === null ||
    typeof cell.text !== 'string' ||
    typeof cell.colspan !== 'number' ||
    typeof cell.rowspan !== 'number' ||
    !(['bold', 'italic', 'strike'] as const).every((key) => optional(cell[key], 'boolean')) ||
    !(['color', 'background'] as const).every((key) => optional(cell[key], 'string'))
  )
    throw new TypeError('Invalid linked spreadsheet cell.');
}

// Only what the document keeps of a cell, whatever else the capture carries.
const keptCell = ({ text, colspan, rowspan, bold, italic, strike, color, background }: Cell) => ({
  ...{ text, colspan, rowspan },
  ...{ bold, italic, strike, color, background },
});

function rowWidth(cells: readonly Cell[], limit: number): number {
  if (cells.length > limit) throw new RangeError('Linked spreadsheet row is too large.');
  let width = 0;
  for (const cell of cells) {
    checkCell(cell);
    width += cell.colspan;
    if (width > limit) throw new RangeError('Linked spreadsheet row is too large.');
  }
  return width;
}

function checkCaptureRows(rows: Rows): void {
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 50_000)
    throw new TypeError('A linked spreadsheet needs a bounded table.');
  const first = rows[0];
  if (!Array.isArray(first)) throw new TypeError('Invalid linked spreadsheet row.');
  const width = rowWidth(first, Math.min(16_384, Math.floor(50_000 / rows.length)));
  for (const cells of rows) {
    if (!Array.isArray(cells)) throw new TypeError('Invalid linked spreadsheet row.');
    rowWidth(cells, width);
  }
}

// Capture limits are transport policy; the canonical constructor owns every grid invariant.
export function buildLinkedSpreadsheetTable(rows: Rows): StoredNode {
  checkCaptureRows(rows);
  return tableFromRows(rows.map((cells) => cells.map(keptCell)));
}
