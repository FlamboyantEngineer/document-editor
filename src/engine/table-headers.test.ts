import type { Node } from 'prosemirror-model';
import { type Command, EditorState, TextSelection } from 'prosemirror-state';
import { CellSelection, findTable } from 'prosemirror-tables';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { readDocumentFile, type StoredNode } from '../model/index.js';
import { createDocumentEditing } from './document-editing.js';
import { insertTableLines } from './table-format.js';
import { tableHeaders, toggleHeaderLines } from './table-headers.js';

const cell = (value: string, type = 'tableCell'): StoredNode => ({
  type,
  content: [{ type: 'paragraph', content: [{ type: 'text', text: value }] }],
});
const head = (value: string) => cell(value, 'tableHeader');
const row = (...cells: StoredNode[]): StoredNode => ({ type: 'tableRow', content: cells });
const read = (...rows: StoredNode[]) =>
  readDocumentFile(
    { formatVersion: 1, sections: [{ name: null, content: [{ type: 'table', content: rows }] }] },
    documentSchema,
  ).doc;

// A table with a header row and a header column.
const headed = () =>
  read(row(head('A1'), head('B1'), head('C1')), row(head('A2'), cell('B2'), cell('C2')));

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

function selectCells(state: EditorState, from: string, to: string): EditorState {
  const $anchor = state.doc.resolve(positionOf(state.doc, from) - 2);
  const $head = state.doc.resolve(positionOf(state.doc, to) - 2);
  return state.apply(state.tr.setSelection(new CellSelection($anchor, $head)));
}

function run(state: EditorState, command: Command): EditorState {
  let next = state;
  expect(command(state, (tr) => (next = next.applyTransaction(tr).state))).toBe(true);
  return next;
}

// The table's cells, row by row: `H` for a header cell and `-` for a plain one.
function kinds(state: EditorState): string[] {
  const found = findTable(state.doc.resolve(positionOf(state.doc, 'A1')));
  const lines: string[] = [];
  found?.node.forEach((line) => {
    let text = '';
    line.forEach((entry) => (text += entry.type.name === 'table_header' ? 'H' : '-'));
    lines.push(text);
  });
  return lines;
}

const headersOf = (state: EditorState) => {
  const found = findTable(state.doc.resolve(positionOf(state.doc, 'A1')));
  return found ? tableHeaders(found.node) : null;
};

describe('header rows and columns', () => {
  it('DOCE-TABLES-3.3 keeps the headers leading when rows or columns go in beside them', () => {
    let state = run(stateAt(headed(), 'B1'), insertTableLines('row', 'before'));
    expect(kinds(state)).toEqual(['HHH', 'HHH', 'H--']);
    state = run(stateAt(headed(), 'B1'), insertTableLines('row', 'after'));
    expect(kinds(state)).toEqual(['HHH', 'H--', 'H--']);
    state = run(stateAt(headed(), 'B2'), insertTableLines('column', 'before'));
    expect(kinds(state)).toEqual(['HHHH', 'H---']);
    state = run(stateAt(headed(), 'A2'), insertTableLines('column', 'before'));
    expect(kinds(state)).toEqual(['HHHH', 'HH--']);
    expect(headersOf(state)).toEqual({ rows: 1, columns: 2 });
  });

  it('DOCE-TABLES-3.8 makes a row a header with the rows before it, and plain with those after', () => {
    const doc = read(
      row(head('A1'), head('B1')),
      row(cell('A2'), cell('B2')),
      row(cell('A3'), cell('B3')),
    );
    let state = run(stateAt(doc, 'A3'), toggleHeaderLines('row'));
    expect(kinds(state)).toEqual(['HH', 'HH', 'HH']);
    state = run(stateAt(state.doc, 'B2'), toggleHeaderLines('row'));
    expect(kinds(state)).toEqual(['HH', '--', '--']);
    state = run(selectCells(state, 'A2', 'B3'), toggleHeaderLines('row'));
    expect(kinds(state)).toEqual(['HH', 'HH', 'HH']);
    state = run(stateAt(state.doc, 'A1'), toggleHeaderLines('row'));
    expect(kinds(state)).toEqual(['--', '--', '--']);
  });

  it('DOCE-TABLES-3.8 keeps a header column when the header rows change', () => {
    let state = run(stateAt(headed(), 'B1'), toggleHeaderLines('row'));
    expect(kinds(state)).toEqual(['H--', 'H--']);
    state = run(stateAt(state.doc, 'B2'), toggleHeaderLines('column'));
    expect(kinds(state)).toEqual(['HH-', 'HH-']);
    state = run(stateAt(state.doc, 'A1'), toggleHeaderLines('column'));
    expect(kinds(state)).toEqual(['---', '---']);
  });
});
