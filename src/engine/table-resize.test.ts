import { EditorState } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { readDocumentFile, type StoredNode } from '../model/index.js';
import { resizeColumns, setColumnWidths } from './table-resize.js';
import { DEFAULT_TABLE_CELL_MIN_WIDTH } from './tables.js';

const cell = (value: string, attrs: Record<string, unknown> = {}): StoredNode => ({
  type: 'tableCell',
  attrs,
  content: [{ type: 'paragraph', content: [{ type: 'text', text: value }] }],
});
const row = (...cells: StoredNode[]): StoredNode => ({ type: 'tableRow', content: cells });

describe('column resize', () => {
  it('DOCE-TABLES-2.4 trades width between the columns either side of a border', () => {
    const max = 1000;
    expect(resizeColumns([100, 200, 300], { column: 0, by: 50, max })).toEqual([150, 150, 300]);
    expect(resizeColumns([100, 200, 300], { column: 1, by: -30, max })).toEqual([100, 170, 330]);
    // Neither column goes narrower than the least.
    expect(resizeColumns([100, 200, 300], { column: 0, by: 400, max })).toEqual([
      300 - DEFAULT_TABLE_CELL_MIN_WIDTH,
      DEFAULT_TABLE_CELL_MIN_WIDTH,
      300,
    ]);
    expect(resizeColumns([100, 200], { column: 0, by: -400, max })).toEqual([
      DEFAULT_TABLE_CELL_MIN_WIDTH,
      300 - DEFAULT_TABLE_CELL_MIN_WIDTH,
    ]);
  });

  it('DOCE-TABLES-3.7 widens the last column no further than the room the table has', () => {
    expect(resizeColumns([100, 200], { column: 1, by: 50, max: 1000 })).toEqual([100, 250]);
    expect(resizeColumns([100, 200], { column: 1, by: 500, max: 400 })).toEqual([100, 300]);
    expect(resizeColumns([100, 200], { column: 1, by: -500, max: 400 })).toEqual([
      100,
      DEFAULT_TABLE_CELL_MIN_WIDTH,
    ]);
  });

  it('DOCE-TABLES-3.7 sets the widths on every cell and ends a fit to the page width', () => {
    const doc = readDocumentFile(
      {
        formatVersion: 1,
        sections: [
          {
            name: null,
            content: [
              {
                type: 'table',
                attrs: { layout: 'fit-page-width' },
                content: [row(cell('A1', { colspan: 2 })), row(cell('A2'), cell('B2'))],
              },
            ],
          },
        ],
      },
      documentSchema,
    ).doc;
    let tablePos = -1;
    doc.descendants((node, pos) => {
      if (tablePos < 0 && node.type.name === 'table') tablePos = pos;
    });
    const state = EditorState.create({ doc });
    let next = state;
    expect(setColumnWidths(tablePos, [240, 360])(state, (tr) => (next = state.apply(tr)))).toBe(
      true,
    );
    const table = next.doc.nodeAt(tablePos);
    expect(table?.attrs.objectLayout).toBe('left');
    const widths: unknown[] = [];
    table?.descendants((node) => {
      if (node.type.name === 'table_cell') widths.push(node.attrs.colwidth);
      return node.type.name !== 'table_cell';
    });
    expect(widths).toEqual([[240, 360], [240], [360]]);
    expect(setColumnWidths(tablePos + 1, [1])(state)).toBe(false);
  });
});
