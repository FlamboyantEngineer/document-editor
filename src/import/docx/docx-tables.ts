// A word processing document's table read into a stored table: its grid's column widths, cells
// spanning columns (`gridSpan`) and rows (`vMerge`), header rows (`tblHeader`), each cell's
// vertical alignment and shading, and the blocks in each cell.

import type { StoredNode } from '../../model/format/document-format.js';
import { childElement, childElements, childValue, type XmlElement } from '../xml-read.js';

/** Twentieths of a point per CSS pixel. */
const TWIPS_PER_PIXEL = 15;

const VERTICAL: Readonly<Record<string, string>> = { top: 'top', bottom: 'bottom' };

interface Cell {
  readonly type: string;
  readonly attrs: Record<string, unknown>;
  readonly content: StoredNode[];
}

// The cell a `w:tc` starts, or null when it continues a cell above (`vMerge` without restart).
function cellOf(
  tc: XmlElement,
  { header, widths }: { header: boolean; widths: (number | null)[] },
  column: number,
) {
  const tcPr = childElement(tc, 'w:tcPr');
  const span = Math.max(1, Number(childValue(tcPr, 'w:gridSpan') ?? 1));
  const merge = childElement(tcPr, 'w:vMerge');
  const continues = !!merge && merge.attrs['w:val'] !== 'restart';
  const colwidth = widths.slice(column, column + span);
  const vertical = VERTICAL[childValue(tcPr, 'w:vAlign') ?? ''];
  const fill = childValue(tcPr, 'w:shd', 'w:fill');
  const attrs: Record<string, unknown> = {
    ...(span > 1 ? { colspan: span } : {}),
    ...(colwidth.length === span && colwidth.every((width) => width) ? { colwidth } : {}),
    ...(vertical ? { verticalAlign: vertical } : {}),
    ...(fill && /^[0-9a-f]{6}$/i.test(fill) ? { background: `#${fill.toLowerCase()}` } : {}),
  };
  return { span, continues, attrs, type: header ? 'tableHeader' : 'tableCell' };
}

/**
 * A `w:tbl` as a stored table (DOCE-IMPORT-2.4), reading each cell's blocks with `readCell`. A
 * cell merged down takes the rows it covers as its `rowspan`; a row left with no cell of its own is
 * left out.
 */
export function readTable(tbl: XmlElement, readCell: (tc: XmlElement) => StoredNode[]): StoredNode {
  const widths = childElements(childElement(tbl, 'w:tblGrid'), 'w:gridCol').map((column) => {
    const twips = Number(column.attrs['w:w']);
    return twips > 0 ? Math.round(twips / TWIPS_PER_PIXEL) : null;
  });
  const above = new Map<number, Cell>();
  const rows: StoredNode[] = [];
  for (const tr of childElements(tbl, 'w:tr')) {
    const header = !!childElement(childElement(tr, 'w:trPr'), 'w:tblHeader');
    const cells: Cell[] = [];
    let column = Number(childValue(childElement(tr, 'w:trPr'), 'w:gridBefore') ?? 0);
    for (const tc of childElements(tr, 'w:tc')) {
      const read = cellOf(tc, { header, widths }, column);
      const started = above.get(column);
      if (read.continues && started) {
        started.attrs.rowspan = (Number(started.attrs.rowspan) || 1) + 1;
      } else {
        const content = readCell(tc);
        const cell = {
          type: read.type,
          attrs: read.attrs,
          content: content.length ? content : [{ type: 'paragraph' }],
        };
        cells.push(cell);
        above.set(column, cell);
      }
      column += read.span;
    }
    if (cells.length) rows.push({ type: 'tableRow', content: cells });
  }
  return {
    type: 'table',
    content: rows.map((row) => ({
      ...row,
      content: (row.content ?? []).map((cell) =>
        Object.keys(cell.attrs ?? {}).length
          ? cell
          : { type: cell.type, content: cell.content ?? [] },
      ),
    })),
  };
}
