import type { Node } from 'prosemirror-model';
import { type Command, EditorState, TextSelection } from 'prosemirror-state';
import { addRowBefore, CellSelection, findTable } from 'prosemirror-tables';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { readDocumentFile, type StoredNode, TABLE_BORDER_1PX_CLASS } from '../model/index.js';
import { createDocumentEditing } from './document-editing.js';
import {
  createTableEditing,
  insertTable,
  moveTableLine,
  selectTableLine,
  tableKeys,
  withTableLine,
} from './tables.js';
import { markRemote } from './transaction-kind.js';

const cell = (value: string, attrs: Record<string, unknown> = {}): StoredNode => ({
  type: 'tableCell',
  attrs,
  content: [{ type: 'paragraph', content: [{ type: 'text', text: value }] }],
});
const row = (...cells: StoredNode[]): StoredNode => ({ type: 'tableRow', content: cells });
const table = (...rows: StoredNode[]): StoredNode => ({ type: 'table', content: rows });
const read = (...content: StoredNode[]) =>
  readDocumentFile({ formatVersion: 1, sections: [{ name: null, content }] }, documentSchema);

const grid = () =>
  read(table(row(cell('A1'), cell('B1'), cell('C1')), row(cell('A2'), cell('B2'), cell('C2'))));

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

function run(state: EditorState, command: Command | undefined): EditorState {
  let next = state;
  expect(command?.(state, (tr) => (next = next.applyTransaction(tr).state))).toBe(true);
  return next;
}

const tablePos = (state: EditorState) => findTable(state.doc.resolve(positionOf(state.doc, 'A1')));

// The table's cells, row by row.
function rows(state: EditorState): string[][] {
  const found = tablePos(state);
  const lines: string[][] = [];
  found?.node.forEach((line) => {
    const texts: string[] = [];
    line.forEach((entry) => texts.push(entry.textContent));
    lines.push(texts);
  });
  return lines;
}

const caretText = (state: EditorState) => state.selection.$from.parent.textContent;

describe('table keys', () => {
  it('DOCE-TABLES-1.1 moves between cells with Tab and Shift-Tab, adding a row after the last', () => {
    let state = stateAt(grid(), 'B1');
    state = run(state, tableKeys().Tab);
    expect(caretText(state)).toBe('C1');
    state = run(state, tableKeys()['Shift-Tab']);
    expect(caretText(state)).toBe('B1');
    state = run(stateAt(grid(), 'C2'), tableKeys().Tab);
    expect(rows(state)).toEqual([
      ['A1', 'B1', 'C1'],
      ['A2', 'B2', 'C2'],
      ['', '', ''],
    ]);
    expect(state.selection.$from.node(-2)).toBe(tablePos(state)?.node.child(2));
  });

  it('DOCE-TABLES-1.1 leaves Tab to the document outside a table', () => {
    const state = stateAt(
      read({ type: 'paragraph', content: [{ type: 'text', text: 'A1' }] }),
      'A1',
    );
    expect(tableKeys().Tab?.(state)).toBe(false);
  });

  it('DOCE-TABLES-1.3 moves the row or column holding the selection with Alt+Shift+arrows', () => {
    let state = stateAt(grid(), 'A1');
    state = run(state, tableKeys()['Alt-Shift-ArrowDown']);
    expect(rows(state)).toEqual([
      ['A2', 'B2', 'C2'],
      ['A1', 'B1', 'C1'],
    ]);
    // The moved row stays selected, across every column; a caret moves one column.
    expect(tableKeys()['Alt-Shift-ArrowRight']?.(state)).toBe(false);
    state = run(stateAt(state.doc, 'A1'), tableKeys()['Alt-Shift-ArrowRight']);
    expect(rows(state)).toEqual([
      ['B2', 'A2', 'C2'],
      ['B1', 'A1', 'C1'],
    ]);
    expect(tableKeys()['Alt-Shift-ArrowDown']?.(stateAt(state.doc, 'A1'))).toBe(false);
  });
});

describe('table lines', () => {
  it('DOCE-TABLES-1.2 moves a row or a column of a table to another index', () => {
    const state = stateAt(grid(), 'B2');
    const at = tablePos(state)?.pos ?? -1;
    const moved = run(state, moveTableLine({ table: at, axis: 'column', index: 0 }, 2));
    expect(rows(moved)).toEqual([
      ['B1', 'C1', 'A1'],
      ['B2', 'C2', 'A2'],
    ]);
    expect(moved.selection).toBeInstanceOf(CellSelection);
    const back = run(moved, moveTableLine({ table: at, axis: 'row', index: 1 }, 0));
    expect(rows(back)[0]).toEqual(['B2', 'C2', 'A2']);
  });

  it('DOCE-TABLES-1.2 refuses a move in place, out of the table or into its own merged cell', () => {
    const state = stateAt(grid(), 'A1');
    const at = tablePos(state)?.pos ?? -1;
    expect(moveTableLine({ table: at, axis: 'row', index: 0 }, 0)(state)).toBe(false);
    expect(moveTableLine({ table: at, axis: 'row', index: 0 }, 2)(state)).toBe(false);
    expect(moveTableLine({ table: at + 1, axis: 'row', index: 0 }, 1)(state)).toBe(false);
    const merged = stateAt(
      read(
        table(
          row(cell('A1', { rowspan: 2 }), cell('B1')),
          row(cell('B2')),
          row(cell('A3'), cell('B3')),
        ),
      ),
      'A1',
    );
    const mergedAt = tablePos(merged)?.pos ?? -1;
    expect(moveTableLine({ table: mergedAt, axis: 'row', index: 0 }, 1)(merged)).toBe(false);
    const down = run(merged, moveTableLine({ table: mergedAt, axis: 'row', index: 0 }, 2));
    expect(rows(down)).toEqual([['A3', 'B3'], ['A1', 'B1'], ['B2']]);
  });

  it('DOCE-TABLES-1.4 selects a whole row or column', () => {
    const state = stateAt(grid(), 'A1');
    const at = tablePos(state)?.pos ?? -1;
    const column = run(state, selectTableLine({ table: at, axis: 'column', index: 1 }));
    const selected: string[] = [];
    (column.selection as CellSelection).forEachCell((node) => selected.push(node.textContent));
    expect(selected).toEqual(['B1', 'B2']);
    expect(selectTableLine({ table: at, axis: 'row', index: 5 })(state)).toBe(false);
  });

  it('DOCE-TABLES-1.4 runs a table command on a whole row or column as one change', () => {
    const state = stateAt(grid(), 'A1');
    const at = tablePos(state)?.pos ?? -1;
    const inserted = run(state, withTableLine({ table: at, axis: 'row', index: 1 }, addRowBefore));
    expect(rows(inserted)).toEqual([
      ['A1', 'B1', 'C1'],
      ['', '', ''],
      ['A2', 'B2', 'C2'],
    ]);
    expect(withTableLine({ table: at + 1, axis: 'row', index: 0 }, addRowBefore)(state)).toBe(
      false,
    );
  });
});

type Attrs = Record<string, unknown>;

function create(name: string, attrs: Attrs | null, content?: Node[] | string): Node {
  const type = documentSchema.nodes[name];
  if (!type) throw new Error(name);
  const children = typeof content === 'string' ? [documentSchema.text(content)] : content;
  return type.create(attrs, children);
}

const tableRow = (kind: string, ...texts: string[]) =>
  create(
    'table_row',
    null,
    texts.map((text) => create(kind, null, [create('paragraph', null, text)])),
  );
const page = (...blocks: Node[]) =>
  create('page', null, [
    create('page_header', null),
    create('page_content', null, blocks),
    create('page_footnotes', null, []),
    create('page_footer', null),
  ]);

// A table the pages split after its first body row, the second part repeating the header.
function splitTable(): EditorState {
  const header = () => tableRow('table_header', 'Name', 'Value');
  const part = (index: number, ...rows: Node[]) =>
    create('table', { dataId: 't1', splitPartIndex: index }, rows);
  const doc = create('doc', null, [
    create('page_section', { sectionName: null }, [
      page(part(0, header(), tableRow('table_cell', 'A', '1'))),
      page(part(1, header(), tableRow('table_cell', 'B', '2'))),
    ]),
  ]);
  return EditorState.create({ doc, plugins: createDocumentEditing(documentSchema) });
}

// Each top-level table of each page, as its rows' text.
function tables(state: EditorState): string[][] {
  const found: string[][] = [];
  state.doc.descendants((node) => {
    if (node.type.name !== 'table') return true;
    const lines: string[] = [];
    node.forEach((line) => {
      const texts: string[] = [];
      line.forEach((entry) => texts.push(entry.textContent));
      lines.push(texts.join('|'));
    });
    found.push(lines);
    return false;
  });
  return found;
}

describe('inserting tables', () => {
  it('DOCE-TABLES-1.6 inserts a table with a header row, the caret in its first cell', () => {
    const text = read({ type: 'paragraph', content: [{ type: 'text', text: 'Intro' }] });
    const after = run(stateAt(text, 'Intro'), insertTable({ rows: 3, columns: 2 }));
    const blocks = after.doc.child(0).child(0).child(1);
    expect(blocks.childCount).toBe(2);
    const table = blocks.child(1);
    expect(table.childCount).toBe(3);
    expect(table.child(0).child(0).type.name).toBe('table_header');
    expect(table.child(1).childCount).toBe(2);
    expect(after.selection.$from.node(-1).type.name).toBe('table_header');
    expect(table.attrs.tableBorderClass).toBe(TABLE_BORDER_1PX_CLASS);
    const empty = read({ type: 'paragraph' });
    const state = EditorState.create({ doc: empty });
    const replaced = run(state, insertTable({ rows: 1, columns: 1 }));
    expect(replaced.doc.child(0).child(0).child(1).firstChild?.type.name).toBe('table');
    expect(insertTable({ rows: 0, columns: 2 })(state)).toBe(false);
  });
});

describe('tables split across pages', () => {
  it('DOCE-TABLES-1.5 moves a column of every part, joining the parts in the same change', () => {
    const state = splitTable();
    let second = -1;
    state.doc.descendants((node, pos) => {
      if (node.type.name === 'table') second = pos;
      return node.type.name !== 'table';
    });
    const moved = run(state, moveTableLine({ table: second, axis: 'column', index: 0 }, 1));
    expect(tables(moved)).toEqual([['Value|Name', '1|A', '2|B']]);
  });

  it('DOCE-TABLES-1.5 leaves a whole table on its page', () => {
    const state = stateAt(grid(), 'A1');
    const at = tablePos(state)?.pos ?? -1;
    const moved = run(state, moveTableLine({ table: at, axis: 'column', index: 0 }, 1));
    expect(tables(moved)).toHaveLength(1);
    expect(moved.doc.child(0).childCount).toBe(1);
  });
});

describe('remote changes', () => {
  it('DOCE-TABLES-1.7 repairs a table after the writer’s change only, not after a remote one', () => {
    const state = EditorState.create({ doc: grid(), plugins: createTableEditing() });
    // Removes the last cell of the second row, leaving that row narrower than the table.
    const removeLast = () => {
      const $c2 = state.doc.resolve(positionOf(state.doc, 'C2'));
      return state.tr.delete($c2.before($c2.depth - 1), $c2.after($c2.depth - 1));
    };
    expect(rows(state.applyTransaction(markRemote(removeLast())).state)[1]).toEqual(['A2', 'B2']);
    expect(rows(state.applyTransaction(removeLast()).state)[1]).toEqual(['A2', 'B2', '']);
  });
});
