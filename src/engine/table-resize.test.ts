import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { installEditorDom } from '../../test/editor-dom.js';
import { readDocumentFile, type StoredNode } from '../model/index.js';
import { createColumnResize, resizeColumns, setColumnWidths } from './table-resize.js';
import { DEFAULT_TABLE_CELL_MIN_WIDTH } from './tables.js';
import { markRemote } from './transaction-kind.js';

installEditorDom();

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
    // Widths for another number of columns than the table has would leave cells without one.
    expect(setColumnWidths(tablePos, [240])(state)).toBe(false);
    expect(setColumnWidths(tablePos, [240, 360, 100])(state)).toBe(false);
  });
});

// A view of a paragraph and a table of two columns, every element laid out 100 pixels wide, with
// the pointer finding the cell that holds a text.
function tableView() {
  const content: StoredNode[] = [
    { type: 'paragraph', content: [{ type: 'text', text: 'Parts' }] },
    { type: 'table', content: [row(cell('Pump'), cell('P-1')), row(cell('Valve'), cell('V-1'))] },
  ];
  const { doc } = readDocumentFile(
    { formatVersion: 1, sections: [{ name: null, content }] },
    documentSchema,
  );
  const view = new EditorView(document.body.appendChild(document.createElement('div')), {
    state: EditorState.create({ doc, plugins: [createColumnResize()] }),
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 100, 20),
  );
  return view;
}

const cellElement = (view: EditorView, text: string) =>
  [...view.dom.querySelectorAll('td')].find((each) => each.textContent === text) as HTMLElement;

const pointer = (type: string, clientX: number) =>
  new MouseEvent(type, { bubbles: true, button: 0, clientX, clientY: 10 });

// Presses the right border of the cell holding a text and drags it 30 pixels to the right.
function dragBorderOf(view: EditorView, text: string) {
  const pressed = cellElement(view, text);
  vi.spyOn(document, 'elementFromPoint').mockReturnValue(pressed.querySelector('p'));
  pressed.dispatchEvent(pointer('mousemove', 98));
  pressed.dispatchEvent(pointer('mousedown', 98));
  document.dispatchEvent(pointer('mousemove', 128));
}

// The widths the cells carry, in the document's order.
function cellWidths(view: EditorView): unknown[] {
  const widths: unknown[] = [];
  view.state.doc.descendants((node) => {
    if (node.type.name === 'table_cell') widths.push(node.attrs.colwidth);
  });
  return widths;
}

// The widths the table's column group shows.
const shownWidths = (view: EditorView) =>
  [...view.dom.querySelectorAll('col')].map((col) => col.style.width);

function tableAt(view: EditorView): number {
  let found = -1;
  view.state.doc.descendants((node, pos) => {
    if (found < 0 && node.type.name === 'table') found = pos;
  });
  return found;
}

describe('dragging a column border', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  it('DOCE-TABLES-2.4 shows the widths while the border is dragged and keeps them on release', () => {
    const view = tableView();
    dragBorderOf(view, 'Pump');
    expect(view.dom).toHaveClass('resize-cursor');
    expect(shownWidths(view)).toEqual(['130px', '70px']);
    document.dispatchEvent(pointer('mouseup', 128));
    expect(cellWidths(view)).toEqual([[130], [70], [130], [70]]);
    expect(view.dom).not.toHaveClass('resize-cursor');
    view.destroy();
  });

  it('DOCE-TABLES-2.4 keeps the widths on the table dragged when text was typed above it meanwhile', () => {
    const view = tableView();
    dragBorderOf(view, 'Pump');
    view.dispatch(markRemote(view.state.tr.insertText('Spare ', tableAt(view) - 1)));
    document.dispatchEvent(pointer('mouseup', 128));
    expect(cellWidths(view)).toEqual([[130], [70], [130], [70]]);
    view.destroy();
  });

  it('DOCE-TABLES-2.4 keeps no widths, and shows those the table had, when a column was added meanwhile', () => {
    const view = tableView();
    const before = shownWidths(view);
    dragBorderOf(view, 'Pump');
    const { schema } = view.state;
    const empty = schema.nodes.table_cell?.createAndFill();
    const tr = view.state.tr;
    view.state.doc.descendants((node, pos) => {
      if (node.type.name === 'table_row' && empty) tr.insert(tr.mapping.map(pos + 1), empty);
    });
    view.dispatch(markRemote(tr));
    document.dispatchEvent(pointer('mouseup', 128));
    expect(cellWidths(view)).toEqual([null, null, null, null, null, null]);
    expect(shownWidths(view)).toEqual(before);
    view.destroy();
  });

  it('DOCE-TABLES-2.4 keeps no widths when the table dragged was removed meanwhile', () => {
    const view = tableView();
    dragBorderOf(view, 'Pump');
    const from = tableAt(view);
    const size = view.state.doc.nodeAt(from)?.nodeSize ?? 0;
    view.dispatch(markRemote(view.state.tr.delete(from, from + size)));
    document.dispatchEvent(pointer('mouseup', 128));
    expect(cellWidths(view)).toEqual([]);
    expect(view.dom).not.toHaveClass('resize-cursor');
    view.destroy();
  });
});
