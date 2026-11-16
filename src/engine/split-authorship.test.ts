import type { Node } from 'prosemirror-model';
import { type Command, EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { readDocumentFile, type StoredNode } from '../model/index.js';
import { documentAuthors } from './authorship.js';
import { createDocumentEditing, documentKeys } from './document-editing.js';

const read = (...content: StoredNode[]) =>
  readDocumentFile({ formatVersion: 1, sections: [{ name: null, content }] }, documentSchema).doc;

const paragraph = (attrs: Record<string, unknown>, ...content: StoredNode[]): StoredNode => ({
  type: 'paragraph',
  attrs,
  content,
});
const text = (value: string, marks?: StoredNode['marks']): StoredNode => ({
  type: 'text',
  text: value,
  ...(marks ? { marks } : {}),
});

function positionOf(doc: Node, value: string): number {
  let found = -1;
  doc.descendants((node, pos) => {
    if (found < 0 && node.isText && node.text?.includes(value))
      found = pos + node.text.indexOf(value);
    return found < 0;
  });
  return found;
}

function splitAt(doc: Node, at: number, writer: string | null) {
  const plugins = createDocumentEditing(documentSchema, { author: () => writer });
  let state = EditorState.create({ doc, plugins });
  state = state.apply(state.tr.setSelection(TextSelection.create(doc, at)));
  const enter = documentKeys(documentSchema).Enter as Command;
  expect(enter(state, (tr) => (state = state.apply(tr)))).toBe(true);
  return state;
}

// Each text run of the text blocks, with who it reads as written by.
function writers(state: EditorState) {
  const runs: string[] = [];
  state.doc.descendants((node) => {
    if (!node.isTextblock) return true;
    const block = node.attrs.dataAuthor as string | null;
    node.forEach((child) => {
      const mark = child.marks.find((each) => each.type.name === 'contributor');
      runs.push(`${child.text ?? ''}:${(mark?.attrs.dataAuthor as string | undefined) ?? block}`);
    });
    return false;
  });
  return runs;
}

const blockAuthors = (state: EditorState) => {
  const authors: unknown[] = [];
  state.doc.descendants((node) => {
    if (node.isTextblock) authors.push(node.attrs.dataAuthor);
    return !node.isTextblock;
  });
  return authors;
};

describe('split authorship', () => {
  it('DOCE-EDITING-1.8 gives both halves to the splitter and keeps the carried text its writer’s', () => {
    const doc = read(paragraph({ id: '0000000a', author: 'ada' }, text('Alpha beta')));
    const state = splitAt(doc, positionOf(doc, 'beta'), 'grace');
    expect(blockAuthors(state)).toEqual(['grace', 'grace']);
    expect(writers(state)).toEqual(['Alpha :ada', 'beta:ada']);
    expect(documentAuthors(state.doc).map((author) => author.id)).toEqual(['ada']);
  });

  it('DOCE-EDITING-1.8 keeps text that has a writer of its own, and leaves a self split unmarked', () => {
    const marked = text('Mine', [{ type: 'contributor', attrs: { author: 'lin' } }]);
    const doc = read(paragraph({ author: 'ada' }, text('Alpha '), marked));
    const state = splitAt(doc, positionOf(doc, 'Mine'), 'grace');
    expect(writers(state)).toEqual(['Alpha :ada', 'Mine:lin']);
    const own = splitAt(doc, positionOf(doc, 'Mine'), 'ada');
    expect(blockAuthors(own)).toEqual(['ada', 'ada']);
    expect(String(own.doc.textContent)).toBe('Alpha Mine');
    own.doc.descendants((node) => {
      if (node.isText && node.text === 'Alpha ') expect(node.marks).toEqual([]);
    });
  });

  it('DOCE-EDITING-1.8 marks no former writer when the split block had none', () => {
    const doc = read(paragraph({}, text('Alpha beta')));
    const state = splitAt(doc, positionOf(doc, 'beta'), 'grace');
    expect(blockAuthors(state)).toEqual(['grace', 'grace']);
    state.doc.descendants((node) => {
      if (node.isText) expect(node.marks).toEqual([]);
    });
  });

  it('DOCE-EDITING-1.8 attributes a list item split the same way, and typing after it is the typist’s', () => {
    const list: StoredNode = {
      type: 'bulletList',
      content: [{ type: 'listItem', content: [paragraph({ author: 'ada' }, text('One two'))] }],
    };
    const doc = read(list);
    let state = splitAt(doc, positionOf(doc, 'two'), 'grace');
    expect(blockAuthors(state)).toEqual(['grace', 'grace']);
    expect(writers(state)).toEqual(['One :ada', 'two:ada']);
    state = state.apply(state.tr.insertText('X'));
    expect(writers(state)).toEqual(['One :ada', 'X:grace', 'two:ada']);
  });
});
