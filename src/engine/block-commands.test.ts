import type { Node } from 'prosemirror-model';
import { type Command, EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { readDocumentFile, type StoredNode } from '../model/index.js';
import { deleteObject, insertParagraphBesideObject, objectBlockAt } from './block-commands.js';

const paragraph = (value: string): StoredNode => ({
  type: 'paragraph',
  content: [{ type: 'text', text: value }],
});
const table: StoredNode = {
  type: 'table',
  content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [paragraph('Cell')] }] }],
};
const read = (...content: StoredNode[]) =>
  readDocumentFile({ formatVersion: 1, sections: [{ name: null, content }] }, documentSchema);

function positionOf(doc: Node, value: string): number {
  let found = -1;
  doc.descendants((node, pos) => {
    if (found < 0 && node.isText && node.text?.includes(value)) found = pos;
    return found < 0;
  });
  return found;
}

function run(state: EditorState, command: Command): EditorState {
  let next = state;
  expect(command(state, (tr) => (next = state.apply(tr)))).toBe(true);
  return next;
}

// The top-level blocks of the first page.
const outline = (state: EditorState) =>
  state.doc
    .child(0)
    .child(0)
    .child(1)
    .children.map((block) => `${block.type.name}:${block.textContent}`);

describe('object blocks', () => {
  it('DOCE-EDITOR-3.4 finds the object holding the caret or selected as a node', () => {
    const doc = read(paragraph('Before'), table);
    const caret = EditorState.create({ doc }).selection;
    expect(objectBlockAt(caret)).toBeNull();
    const inCell = TextSelection.create(doc, positionOf(doc, 'Cell'));
    const at = objectBlockAt(inCell);
    expect(at === null ? null : doc.nodeAt(at)?.type.name).toBe('table');
    expect(objectBlockAt(NodeSelection.create(doc, at ?? 0))).toBe(at);
  });

  it('DOCE-EDITOR-3.4 adds a paragraph before or after an object and deletes it', () => {
    const doc = read(table);
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, positionOf(doc, 'Cell')),
    });
    const before = run(state, insertParagraphBesideObject('before'));
    expect(outline(before)).toEqual(['paragraph:', 'table:Cell']);
    expect(before.selection.$from.parent.type.name).toBe('paragraph');
    const after = run(state, insertParagraphBesideObject('after'));
    expect(outline(after)).toEqual(['table:Cell', 'paragraph:']);
    const deleted = run(state, deleteObject);
    expect(outline(deleted)).toEqual(['paragraph:']);
    const outside = EditorState.create({ doc: read(paragraph('Text')) });
    expect(insertParagraphBesideObject('before')(outside)).toBe(false);
    expect(deleteObject(outside)).toBe(false);
  });
});
