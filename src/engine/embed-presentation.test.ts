import type { Node } from 'prosemirror-model';
import { type Command, EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { readDocumentFile, type StoredContent, type StoredNode } from '../model/index.js';
import { createDocumentEditing } from './document-editing.js';
import { applyEmbedUpdate } from './embed-status.js';
import { listEmbeds } from './embeds.js';
import { setCellAlignment } from './table-format.js';
import { toggleHeaderLines } from './table-headers.js';
import { setRowHeight } from './table-pointer.js';
import { setColumnWidths } from './table-resize.js';

const text = (value: string): StoredNode => ({ type: 'text', text: value });
const cell = (value: string): StoredNode => ({
  type: 'tableCell',
  content: [{ type: 'paragraph', content: [text(value)] }],
});
// A table of rows of two cells.
const table = (...rows: (readonly [string, string])[]): StoredContent => [
  {
    type: 'table',
    content: rows.map(([one, two]) => ({ type: 'tableRow', content: [cell(one), cell(two)] })),
  },
];
const embedded = (content: StoredContent): StoredNode => ({
  type: 'embed',
  attrs: { id: 'e0000001', kind: 'data-set', source: 'set-7', snapshot: 'r1', label: 'Set 7' },
  content,
});

function stateWith(content: StoredContent): EditorState {
  const stored: StoredNode[] = [
    { type: 'paragraph', content: [text('Before')] },
    embedded(content),
  ];
  const file = { formatVersion: 1 as const, sections: [{ name: null, content: stored }] };
  const doc = readDocumentFile(file, documentSchema).doc;
  return EditorState.create({ doc, plugins: createDocumentEditing(documentSchema) });
}

// A node's text, its blocks run together.
const textOf = (node: Node) => node.textBetween(0, node.content.size);

const embedOf = (state: EditorState) => {
  const found = listEmbeds(state.doc)[0];
  if (!found) throw new Error('no embed');
  return found;
};
// The table an embed holds, after its caption, and where its caption is.
const tableOf = (state: EditorState) => {
  const { pos, node } = embedOf(state);
  const caption = node.firstChild?.firstChild;
  const held = node.firstChild?.lastChild;
  if (!held || !caption) throw new Error('no table');
  return { pos: pos + 2 + caption.nodeSize, node: held, caption: { pos: pos + 2, node: caption } };
};
const cells = (node: Node, attr: string) => {
  const found: unknown[] = [];
  node.descendants((child) => {
    if (child.type.spec.tableRole === 'cell' || child.type.spec.tableRole === 'header_cell')
      found.push(child.attrs[attr]);
    return child.type.spec.tableRole !== 'cell';
  });
  return found;
};

// A command run on a state, applying where the plugins let it.
function run(state: EditorState, command: Command) {
  let next = state;
  command(state, (tr) => {
    next = state.apply(tr);
  });
  return next;
}

// The state with the caret in the cell holding a text.
function inCell(state: EditorState, value: string): EditorState {
  let at = -1;
  state.doc.descendants((node, pos) => {
    if (at < 0 && node.isText && node.text === value) at = pos;
    return at < 0;
  });
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, at)));
}

describe('tables an embed holds', () => {
  it('DOCE-EMBEDS-2.3 lets the writer resize, align and set header cells of an embedded table', () => {
    const state = stateWith(table(['Pump', '4'], ['Valve', '2']));
    const { pos } = tableOf(state);
    const widened = run(state, setColumnWidths(pos, [200, 100]));
    expect(cells(tableOf(widened).node, 'colwidth')).toEqual([[200], [100], [200], [100]]);
    const taller = run(widened, setRowHeight(pos, 1, 60));
    expect(cells(tableOf(taller).node, 'rowHeight')).toEqual([null, null, 60, 60]);
    const centered = run(inCell(taller, 'Pump'), setCellAlignment({ textAlign: 'center' }));
    expect(cells(tableOf(centered).node, 'textAlign')[0]).toBe('center');
    const header = run(inCell(centered, 'Pump'), toggleHeaderLines('row'));
    expect(tableOf(header).node.firstChild?.firstChild?.type.name).toBe('table_header');
    expect(textOf(tableOf(header).node)).toBe('Pump4Valve2');
  });

  it('DOCE-EMBEDS-2.3 still refuses colors and every change to what the cells hold', () => {
    const state = stateWith(table(['Pump', '4']));
    const { pos, node } = tableOf(state);
    const first = node.firstChild?.firstChild;
    if (!first) throw new Error('no cell');
    const colored = state.tr.setNodeMarkup(pos + 2, undefined, {
      ...first.attrs,
      backgroundColor: '#ff0000',
    });
    expect(state.apply(colored).doc.eq(state.doc)).toBe(true);
    const typed = state.tr.insertText('x', pos + 4);
    expect(state.apply(typed).doc.eq(state.doc)).toBe(true);
  });

  it('DOCE-EMBEDS-3.2 keeps the writer’s widths, heights, alignment and caption across an update, on the loaded rows', () => {
    let state = stateWith(table(['Pump', '4'], ['Valve', '2']));
    const { pos, node } = tableOf(state);
    state = run(state, setColumnWidths(pos, [200, 100]));
    state = run(state, setRowHeight(pos, 0, 50));
    state = run(inCell(state, '2'), setCellAlignment({ textAlign: 'right' }));
    const aligned = state.tr.setNodeMarkup(pos, undefined, {
      ...tableOf(state).node.attrs,
      objectLayout: 'center',
    });
    state = state.apply(aligned);
    // The writer types the caption of the table the embed holds.
    state = state.apply(state.tr.insertText('Stock', tableOf(state).caption.pos + 1));
    const { node: caption } = tableOf(state).caption;
    expect(caption.textBetween(0, caption.content.size)).toBe('Stock');
    expect(node.childCount).toBe(2);
    const loaded = {
      snapshot: 'r2',
      label: 'Set 7',
      content: table(['Pump', '5'], ['Valve', '3'], ['Tank', '1']),
    };
    state = run(state, applyEmbedUpdate(embedOf(state).pos, loaded));
    const updated = tableOf(state).node;
    expect(textOf(updated)).toBe('Pump5Valve3Tank1');
    expect(updated.attrs).toMatchObject({ objectLayout: 'center' });
    const { node: kept } = tableOf(state).caption;
    expect(kept.textBetween(0, kept.content.size)).toBe('Stock');
    // Widths are the columns': the loaded row takes them too.
    expect(cells(updated, 'colwidth')).toEqual([[200], [100], [200], [100], [200], [100]]);
    expect(cells(updated, 'rowHeight')).toEqual([50, 50, null, null, null, null]);
    expect(cells(updated, 'textAlign')).toEqual(['left', 'left', 'left', 'right', 'left', 'left']);
  });
});
