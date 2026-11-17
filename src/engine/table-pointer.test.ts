import { EditorState, TextSelection } from 'prosemirror-state';
import { CellSelection } from 'prosemirror-tables';
import { EditorView } from 'prosemirror-view';
import { afterEach, describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { readDocumentFile, type StoredNode } from '../model/index.js';
import { createEditLock } from './edit-lock.js';
import { createTablePointer } from './table-pointer.js';

const cell = (value: string): StoredNode => ({
  type: 'tableCell',
  content: [{ type: 'paragraph', content: value ? [{ type: 'text', text: value }] : [] }],
});
const row = (...cells: StoredNode[]): StoredNode => ({ type: 'tableRow', content: cells });

const pointer = createTablePointer();

// A view of a paragraph and a table of two rows and an empty cell; a lock may cover it all.
function tableView(locked = false) {
  const content: StoredNode[] = [
    { type: 'paragraph', content: [{ type: 'text', text: 'Parts' }] },
    { type: 'table', content: [row(cell('Pump'), cell('P-1')), row(cell('Valve'), cell(''))] },
  ];
  const { doc } = readDocumentFile(
    { formatVersion: 1, sections: [{ name: null, content }] },
    documentSchema,
  );
  const view = new EditorView(document.body.appendChild(document.createElement('div')), {
    state: EditorState.create({
      doc,
      plugins: [pointer, ...(locked ? [createEditLock({ isLocked: () => true })] : [])],
    }),
  });
  return view;
}

const cellElement = (view: EditorView, text: string) =>
  [...view.dom.querySelectorAll('td')].find((each) => each.textContent === text) as HTMLElement;

// The position before the table.
function tableAt(view: EditorView): number {
  let found = -1;
  view.state.doc.descendants((node, pos) => {
    if (found < 0 && node.type.name === 'table') found = pos;
  });
  return found;
}

afterEach(() => {
  document.body.replaceChildren();
});

// A click or double click on an element, as the view hands it to the plugin.
function clickOn(view: EditorView, target: Element, kind: 'handleClick' | 'handleDoubleClick') {
  const event = { button: 0, target, ctrlKey: false, metaKey: false, shiftKey: false };
  return pointer.props[kind]?.call(pointer, view, 0, event as unknown as MouseEvent) ?? false;
}

const paragraphIn = (view: EditorView, text: string) =>
  cellElement(view, text).querySelector('p') as HTMLElement;

describe('clicks in cells', () => {
  it('DOCE-TABLES-3.11 selects a cell clicked in its padding, and leaves a click on its text', () => {
    const view = tableView();
    expect(clickOn(view, paragraphIn(view, 'Pump'), 'handleClick')).toBe(false);
    expect(clickOn(view, cellElement(view, 'Valve'), 'handleClick')).toBe(true);
    const { selection } = view.state;
    expect(selection).toBeInstanceOf(CellSelection);
    expect((selection as CellSelection).$anchorCell.nodeAfter?.textContent).toBe('Valve');
    view.destroy();
  });

  it('DOCE-TABLES-3.11 selects the content of a cell as text with a double click on it', () => {
    const view = tableView();
    expect(clickOn(view, paragraphIn(view, 'Valve'), 'handleDoubleClick')).toBe(true);
    const { selection } = view.state;
    expect(selection).toBeInstanceOf(TextSelection);
    expect(view.state.doc.textBetween(selection.from, selection.to)).toBe('Valve');
    view.destroy();
  });

  it('DOCE-TABLES-3.11 selects every cell of the table with a double click in a padding', () => {
    const view = tableView();
    expect(clickOn(view, cellElement(view, 'P-1'), 'handleDoubleClick')).toBe(true);
    const { selection } = view.state;
    expect(selection).toBeInstanceOf(CellSelection);
    let cells = 0;
    (selection as CellSelection).forEachCell(() => (cells += 1));
    expect(cells).toBe(4);
    view.destroy();
  });

  it('DOCE-TABLES-3.11 keeps the caret in an empty cell', () => {
    const view = tableView();
    const empty = [...view.dom.querySelectorAll('td')].find((each) => !each.textContent) as Element;
    expect(clickOn(view, empty, 'handleClick')).toBe(false);
    expect(clickOn(view, empty, 'handleDoubleClick')).toBe(false);
    view.destroy();
  });

  it('DOCE-TABLES-3.11 selects no cells a lock covers', () => {
    const view = tableView(true);
    expect(clickOn(view, cellElement(view, 'Valve'), 'handleClick')).toBe(false);
    const $cell = view.state.doc.resolve(tableAt(view) + 2);
    view.dispatch(view.state.tr.setSelection(new CellSelection($cell)));
    expect(view.state.selection).toBeInstanceOf(TextSelection);
    view.destroy();
  });
});
