import type { Node } from 'prosemirror-model';
import { type Command, EditorState, TextSelection } from 'prosemirror-state';
import { CellSelection, findTable, TableMap } from 'prosemirror-tables';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { readDocumentFile, type StoredNode } from '../model/index.js';
import { createDocumentEditing } from './document-editing.js';
import { splitTableCell } from './table-split.js';

const cell = (value: string, attrs: Record<string, unknown> = {}): StoredNode => ({
  type: 'tableCell',
  attrs,
  content: [{ type: 'paragraph', content: [{ type: 'text', text: value }] }],
});
const row = (...cells: StoredNode[]): StoredNode => ({ type: 'tableRow', content: cells });
const read = (...rows: StoredNode[]) =>
  readDocumentFile(
    { formatVersion: 1, sections: [{ name: null, content: [{ type: 'table', content: rows }] }] },
    documentSchema,
  );

const grid = () =>
  read(
    row(cell('A1', { colwidth: [100] }), cell('B1', { colwidth: [301] })),
    row(cell('A2', { colwidth: [100] }), cell('B2', { colwidth: [301] })),
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

// The table's cells, row by row, as `text colspan×rowspan widths`.
function shape(state: EditorState): string[] {
  const found = findTable(state.doc.resolve(positionOf(state.doc, 'A1')));
  const lines: string[] = [];
  found?.node.forEach((line) => {
    const texts: string[] = [];
    line.forEach((entry) => {
      const { colspan, rowspan, colwidth } = entry.attrs;
      const widths = (colwidth as number[] | null)?.join(',') ?? '-';
      texts.push(`${entry.textContent || '_'} ${String(colspan)}x${String(rowspan)} ${widths}`);
    });
    lines.push(texts.join(' | '));
  });
  return lines;
}

const width = (state: EditorState) => {
  const found = findTable(state.doc.resolve(positionOf(state.doc, 'A1')));
  return found ? TableMap.get(found.node).width : 0;
};

describe('splitting cells', () => {
  it('DOCE-TABLES-3.9 splits a cell side by side, the column’s other cells spanning both', () => {
    const state = run(stateAt(grid(), 'B1'), splitTableCell('column'));
    expect(shape(state)).toEqual([
      'A1 1x1 100 | B1 1x1 151 | _ 1x1 150',
      'A2 1x1 100 | B2 2x1 151,150',
    ]);
    expect(width(state)).toBe(3);
    expect(state.selection.$from.parent.childCount).toBe(0);
    expect(state.selection.$from.node(-1).attrs.colwidth).toEqual([150]);
  });

  it('DOCE-TABLES-3.9 splits a cell one above the other, the row’s other cells spanning both', () => {
    const state = run(stateAt(grid(), 'A2'), splitTableCell('row'));
    expect(shape(state)).toEqual([
      'A1 1x1 100 | B1 1x1 301',
      'A2 1x1 100 | B2 1x2 301',
      '_ 1x1 100',
    ]);
  });

  it('DOCE-TABLES-3.9 splits a merged cell back into the cells it covers', () => {
    const merged = read(
      row(cell('A1', { colspan: 2, colwidth: [100, 301] })),
      row(cell('A2', { colwidth: [100] }), cell('B2', { colwidth: [301] })),
    );
    const state = run(stateAt(merged, 'A1'), splitTableCell('row'));
    expect(shape(state)[0]).toBe('A1 1x1 100 | _ 1x1 301');
  });

  it('DOCE-TABLES-3.9 refuses several selected cells and a caret outside a table', () => {
    const state = stateAt(grid(), 'A1');
    const $anchor = state.doc.resolve(positionOf(state.doc, 'A1') - 2);
    const $head = state.doc.resolve(positionOf(state.doc, 'B1') - 2);
    const selected = state.apply(state.tr.setSelection(new CellSelection($anchor, $head)));
    expect(splitTableCell('column')(selected)).toBe(false);
    const paragraph = readDocumentFile(
      {
        formatVersion: 1,
        sections: [
          { name: null, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A1' }] }] },
        ],
      },
      documentSchema,
    );
    expect(splitTableCell('column')(stateAt(paragraph, 'A1'))).toBe(false);
  });
});
