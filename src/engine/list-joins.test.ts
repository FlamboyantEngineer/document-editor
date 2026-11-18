import type { Node } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { readDocumentFile, type StoredNode } from '../model/index.js';
import { createDocumentEditing } from './document-editing.js';
import { markRemote } from './transaction-kind.js';

const paragraph = (value: string): StoredNode => ({
  type: 'paragraph',
  content: [{ type: 'text', text: value }],
});
const items = (values: string[]) =>
  values.map((value): StoredNode => ({ type: 'listItem', content: [paragraph(value)] }));
const bullets = (...values: string[]): StoredNode => ({
  type: 'bulletList',
  content: items(values),
});
const numbered = (order: number, ...values: string[]): StoredNode => ({
  type: 'orderedList',
  attrs: { start: order },
  content: items(values),
});
const read = (...content: StoredNode[]) =>
  readDocumentFile({ formatVersion: 1, sections: [{ name: null, content }] }, documentSchema).doc;

const stateOf = (doc: Node) =>
  EditorState.create({ doc, plugins: createDocumentEditing(documentSchema) });

// The top-level blocks of the first page, by type and text.
const outline = (state: EditorState) =>
  state.doc
    .child(0)
    .child(0)
    .child(1)
    .children.map((block) => `${block.type.name}:${block.textContent}`);

// Deletes the paragraph holding a text, as the writer would, or as a collaborator's change.
function deleteParagraph(state: EditorState, value: string, remote = false) {
  let range: [number, number] | null = null;
  state.doc.descendants((node, pos) => {
    if (range === null && node.type.name === 'paragraph' && node.textContent === value)
      range = [pos, pos + node.nodeSize];
    return range === null;
  });
  if (!range) throw new Error(`No paragraph ${value}`);
  const tr = state.tr.delete(...(range as [number, number]));
  return state.applyTransaction(remote ? markRemote(tr) : tr).state;
}

describe('list joins', () => {
  it('DOCE-EDITING-2.2 joins two bulleted lists the writer leaves side by side', () => {
    const state = deleteParagraph(
      stateOf(read(bullets('One'), paragraph('Gap'), bullets('Two'))),
      'Gap',
    );
    expect(outline(state)).toEqual(['bullet_list:OneTwo']);
    expect(state.doc.child(0).child(0).child(1).child(0).childCount).toBe(2);
  });

  it('DOCE-EDITING-2.2 joins a numbered list only when it carries on the count before it', () => {
    const doc = read(numbered(1, 'One', 'Two'), paragraph('Gap'), numbered(3, 'Three'));
    expect(outline(deleteParagraph(stateOf(doc), 'Gap'))).toEqual(['ordered_list:OneTwoThree']);
    const restart = read(numbered(1, 'One', 'Two'), paragraph('Gap'), numbered(1, 'Again'));
    expect(outline(deleteParagraph(stateOf(restart), 'Gap'))).toEqual([
      'ordered_list:OneTwo',
      'ordered_list:Again',
    ]);
  });

  it('DOCE-EDITING-2.2 leaves lists of other kinds and a collaborator change as they are', () => {
    const mixed = read(bullets('One'), paragraph('Gap'), numbered(1, 'Two'));
    expect(outline(deleteParagraph(stateOf(mixed), 'Gap'))).toEqual([
      'bullet_list:One',
      'ordered_list:Two',
    ]);
    const shared = read(bullets('One'), paragraph('Gap'), bullets('Two'));
    expect(outline(deleteParagraph(stateOf(shared), 'Gap', true))).toEqual([
      'bullet_list:One',
      'bullet_list:Two',
    ]);
  });

  it('DOCE-EDITING-2.2 undoes the join with the change that made it', async () => {
    const { undo } = await import('prosemirror-history');
    let state = deleteParagraph(
      stateOf(read(bullets('One'), paragraph('Gap'), bullets('Two'))),
      'Gap',
    );
    state = state.apply(state.tr.setSelection(TextSelection.atStart(state.doc)));
    undo(state, (tr) => (state = state.apply(tr)));
    expect(outline(state)).toEqual(['bullet_list:One', 'paragraph:Gap', 'bullet_list:Two']);
  });
});
