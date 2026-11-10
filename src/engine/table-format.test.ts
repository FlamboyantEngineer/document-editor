import type { Node } from 'prosemirror-model';
import { type Command, EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { CellSelection } from 'prosemirror-tables';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { readDocumentFile, type StoredNode } from '../model/index.js';
import { captionedAt, setCaption, toggleCaption } from './captions.js';
import { createDocumentEditing, documentKeys } from './document-editing.js';
import { distributeColumns, insertTableLines, setCellAlignment } from './table-format.js';

const cell = (value: string, attrs: Record<string, unknown> = {}): StoredNode => ({
  type: 'tableCell',
  attrs,
  content: [{ type: 'paragraph', content: [{ type: 'text', text: value }] }],
});
const row = (...cells: StoredNode[]): StoredNode => ({ type: 'tableRow', content: cells });
const table = (...rows: StoredNode[]): StoredNode => ({
  type: 'table',
  attrs: { caption: 'Limits' },
  content: rows,
});
const read = (...content: StoredNode[]) =>
  readDocumentFile({ formatVersion: 1, sections: [{ name: null, content }] }, documentSchema);

const grid = () =>
  read(
    table(
      row(cell('A1', { colwidth: [100] }), cell('B1', { colwidth: [300] })),
      row(cell('A2', { colwidth: [100] }), cell('B2', { colwidth: [300] })),
    ),
  );

function positionOf(doc: Node, value: string): number {
  let found = -1;
  doc.descendants((node, pos) => {
    if (found < 0 && node.isText && node.text?.includes(value)) found = pos;
    return found < 0;
  });
  return found;
}

function stateAt(doc: Node, value: string): EditorState {
  const state = EditorState.create({ doc, plugins: createDocumentEditing(documentSchema) });
  return state.apply(state.tr.setSelection(TextSelection.create(doc, positionOf(doc, value))));
}

function run(state: EditorState, command: Command): EditorState {
  let next = state;
  expect(command(state, (tr) => (next = next.applyTransaction(tr).state))).toBe(true);
  return next;
}

const cells = (state: EditorState) => {
  const found: Record<string, unknown>[] = [];
  state.doc.descendants((node) => {
    if (node.type.name === 'table_cell') found.push(node.attrs);
  });
  return found;
};

const rows = (state: EditorState) => {
  let count = 0;
  state.doc.descendants((node) => {
    if (node.type.name === 'table_row') count += 1;
  });
  return count;
};

// Selects the cells from one text's cell to another's.
function selectCells(state: EditorState, from: string, to: string): EditorState {
  const $anchor = state.doc.resolve(positionOf(state.doc, from) - 2);
  const $head = state.doc.resolve(positionOf(state.doc, to) - 2);
  return state.apply(state.tr.setSelection(new CellSelection($anchor, $head)));
}

describe('table formatting', () => {
  it('DOCE-TABLES-3.1 aligns the selected cells across and down', () => {
    let state = selectCells(stateAt(grid(), 'A1'), 'A1', 'B1');
    state = run(state, setCellAlignment({ textAlign: 'center', verticalAlign: 'bottom' }));
    expect(
      cells(state).map((attrs) => `${String(attrs.textAlign)}/${String(attrs.verticalAlign)}`),
    ).toEqual(['center/bottom', 'center/bottom', 'left/middle', 'left/middle']);
    state = run(stateAt(state.doc, 'B2'), setCellAlignment({ textAlign: 'right' }));
    expect(cells(state)[3]).toMatchObject({ textAlign: 'right', verticalAlign: 'middle' });
  });

  it('DOCE-TABLES-3.2 gives the columns equal widths, keeping the table width', () => {
    const state = run(stateAt(grid(), 'A2'), distributeColumns);
    expect(cells(state).map((attrs) => attrs.colwidth)).toEqual([[200], [200], [200], [200]]);
    expect(distributeColumns(state)).toBe(false);
  });

  it('DOCE-TABLES-3.3 inserts as many rows or columns as the selection spans', () => {
    let state = selectCells(stateAt(grid(), 'A1'), 'A1', 'A2');
    state = run(state, insertTableLines('row', 'after'));
    expect(rows(state)).toBe(4);
    state = run(selectCells(state, 'A1', 'B1'), insertTableLines('column', 'before'));
    expect(cells(state)).toHaveLength(16);
  });

  it('DOCE-TABLES-3.4 inserts a three by three table with Mod-Alt-T', () => {
    const doc = read({ type: 'paragraph', content: [{ type: 'text', text: 'Intro' }] });
    const state = run(
      stateAt(doc, 'Intro'),
      documentKeys(documentSchema)['Mod-Alt-t'] ?? (() => false),
    );
    expect(rows(state)).toBe(3);
    // Three cells in each row below the header row.
    expect(cells(state)).toHaveLength(6);
  });
});

describe('captions', () => {
  it('DOCE-OBJECTS-2.1 sets the caption of the object at the selection, and hides and shows it', () => {
    let state = stateAt(grid(), 'B2');
    expect(captionedAt(state)?.node.attrs.caption).toBe('Limits');
    state = run(state, setCaption('  Power   limits '));
    expect(captionedAt(state)?.node.attrs).toMatchObject({
      caption: 'Power limits',
      captionEnabled: true,
    });
    state = run(state, toggleCaption());
    expect(captionedAt(state)?.node.attrs.captionEnabled).toBe(false);
    state = run(state, setCaption('Power limits'));
    expect(captionedAt(state)?.node.attrs.captionEnabled).toBe(true);
    const figure = read({ type: 'figure', attrs: { src: 'a.png', caption: 'Board' } });
    let selected = EditorState.create({ doc: figure });
    let at = -1;
    figure.descendants((node, pos) => {
      if (node.type.name === 'figure') at = pos;
    });
    selected = selected.apply(selected.tr.setSelection(NodeSelection.create(figure, at)));
    expect(captionedAt(selected)?.node.type.name).toBe('figure');
    expect(toggleCaption(true)(selected)).toBe(false);
  });
});
