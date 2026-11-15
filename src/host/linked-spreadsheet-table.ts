import { tableFromRows } from '../document/stored-table.js';
import type { StoredNode } from '../model/format/document-format.js';
import type { LinkedSpreadsheetCapture } from './linked-spreadsheet.js';

type Rows = LinkedSpreadsheetCapture['table']['rows'];
type Cell = Rows[number][number];

function checkCell(cell: Cell): void {
  if (
    typeof cell !== 'object' ||
    cell === null ||
    typeof cell.text !== 'string' ||
    typeof cell.colspan !== 'number' ||
    typeof cell.rowspan !== 'number'
  )
    throw new TypeError('Invalid linked spreadsheet cell.');
}

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
  return tableFromRows(rows);
}
