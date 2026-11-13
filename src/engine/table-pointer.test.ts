import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { readDocumentFile, type StoredNode } from '../model/index.js';
import { createTablePointer } from './table-pointer.js';
import { markRemote } from './transaction-kind.js';

const cell = (value: string): StoredNode => ({
  type: 'tableCell',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: value }] }],
});
const row = (...cells: StoredNode[]): StoredNode => ({ type: 'tableRow', content: cells });

// A view of a paragraph and a table of two rows, each cell 20 pixels high with its bottom at 40.
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
    state: EditorState.create({ doc, plugins: [createTablePointer()] }),
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 20, 100, 20),
  );
  return view;
}

const cellElement = (view: EditorView, text: string) =>
  [...view.dom.querySelectorAll('td')].find((each) => each.textContent === text) as HTMLElement;

// Each row's first cell's text with the height its cells carry.
function rowHeights(view: EditorView): [string, unknown][] {
  const heights: [string, unknown][] = [];
  view.state.doc.descendants((node) => {
    if (node.type.name === 'table_row') {
      heights.push([node.firstChild?.textContent ?? '', node.firstChild?.attrs.rowHeight]);
    }
  });
  return heights;
}

const press = (element: Element, clientY: number) =>
  element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientY }));
const release = (clientY: number) =>
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientY }));

// The position before the table.
function tableAt(view: EditorView): number {
  let found = -1;
  view.state.doc.descendants((node, pos) => {
    if (found < 0 && node.type.name === 'table') found = pos;
  });
  return found;
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('dragging a row border', () => {
  it('DOCE-TABLES-3.6 sets the height of the row dragged once the pointer is released', () => {
    const view = tableView();
    press(cellElement(view, 'Valve'), 39);
    release(60);
    expect(rowHeights(view)).toEqual([
      ['Pump', null],
      ['Valve', 41],
    ]);
    view.destroy();
  });

  it('DOCE-TABLES-3.6 sets the height of the row dragged when rows were added above it meanwhile', () => {
    const view = tableView();
    press(cellElement(view, 'Valve'), 39);
    const { tr, schema } = view.state;
    const empty = schema.nodes.table_cell?.createAndFill();
    const added = empty && schema.nodes.table_row?.create(null, [empty, empty]);
    if (added) view.dispatch(markRemote(tr.insert(tableAt(view) + 1, added)));
    release(60);
    expect(rowHeights(view)).toEqual([
      ['', null],
      ['Pump', null],
      ['Valve', 41],
    ]);
    view.destroy();
  });

  it('DOCE-TABLES-3.6 sets the height of the row dragged when text was typed above the table meanwhile', () => {
    const view = tableView();
    press(cellElement(view, 'Valve'), 39);
    view.dispatch(markRemote(view.state.tr.insertText('Spare ', tableAt(view) - 1)));
    release(60);
    expect(rowHeights(view)).toEqual([
      ['Pump', null],
      ['Valve', 41],
    ]);
    view.destroy();
  });

  it('DOCE-TABLES-3.6 sets no height when the row dragged was removed meanwhile', () => {
    const view = tableView();
    press(cellElement(view, 'Valve'), 39);
    const table = view.state.doc.nodeAt(tableAt(view));
    const first = table?.firstChild?.nodeSize ?? 0;
    const from = tableAt(view) + 1 + first;
    view.dispatch(markRemote(view.state.tr.delete(from, from + (table?.lastChild?.nodeSize ?? 0))));
    release(60);
    expect(rowHeights(view)).toEqual([['Pump', null]]);
    view.destroy();
  });
});
