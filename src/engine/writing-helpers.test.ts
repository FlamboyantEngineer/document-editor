import { EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { readDocumentFile, type StoredNode } from '../model/index.js';
import { createDocumentEditing } from './document-editing.js';
import { markRemote } from './transaction-kind.js';
import { contentLimitOf, documentCounts } from './writing-helpers.js';

const docOf = (...content: StoredNode[]) =>
  readDocumentFile({ formatVersion: 1, sections: [{ name: null, content }] }, documentSchema).doc;

const paragraph = (text: string): StoredNode => ({
  type: 'paragraph',
  content: text ? [{ type: 'text', text }] : [],
});

// The state with the caret at the end of the first text block.
function atFirstEnd(state: EditorState): EditorState {
  let end = -1;
  state.doc.descendants((node, pos) => {
    if (end < 0 && node.isTextblock) end = pos + 1 + node.content.size;
    return end < 0;
  });
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, end)));
}

// The type names of the first section's content blocks.
function blocks(state: EditorState): string[] {
  const names: string[] = [];
  state.doc.descendants((node, _pos, parent) => {
    if (parent?.type.name === 'page_content' || parent?.type.name === 'doc') {
      if (node.isBlock && !['page_section', 'page', 'page_content'].includes(node.type.name)) {
        names.push(node.type.name);
      }
    }
    return true;
  });
  return names;
}

describe('documentCounts', () => {
  it('DOCE-EDITING-10.1 counts the words and characters of the body', () => {
    expect(documentCounts(docOf(paragraph('Two words'), paragraph('and three more')))).toEqual({
      words: 5,
      characters: 23,
    });
  });
});

describe('the content limit', () => {
  it('DOCE-EDITING-10.2 refuses a local change past the limit and keeps one that shortens', () => {
    const plugins = createDocumentEditing(documentSchema, { limit: { words: 3 } });
    let state = atFirstEnd(EditorState.create({ doc: docOf(paragraph('One two')), plugins }));
    expect(contentLimitOf(state)).toEqual({ words: 3 });
    state = state.apply(state.tr.insertText(' three'));
    expect(documentCounts(state.doc).words).toBe(3);
    const refused = state.apply(state.tr.insertText(' four'));
    expect(refused.doc.eq(state.doc)).toBe(true);
    const remote = state.apply(markRemote(state.tr.insertText(' four')));
    expect(documentCounts(remote.doc).words).toBe(4);
    const shorter = remote.apply(
      remote.tr.delete(remote.selection.from - 2, remote.selection.from),
    );
    expect(shorter.doc.eq(remote.doc)).toBe(false);
  });

  it('DOCE-EDITING-10.2 limits the characters', () => {
    const plugins = createDocumentEditing(documentSchema, { limit: { characters: 5 } });
    const state = atFirstEnd(EditorState.create({ doc: docOf(paragraph('abcd')), plugins }));
    const textOf = (next: EditorState) => next.doc.textBetween(0, next.doc.content.size);
    expect(textOf(state.apply(state.tr.insertText('e')))).toBe('abcde');
    expect(textOf(state.apply(state.tr.insertText('ef')))).toBe('abcd');
  });
});

describe('the trailing paragraph', () => {
  it('DOCE-EDITING-10.3 keeps a paragraph after a last block that is no paragraph', () => {
    const plugins = createDocumentEditing(documentSchema, { trailingParagraph: true });
    let state = atFirstEnd(
      EditorState.create({ doc: docOf(paragraph('Text'), { type: 'rule' }), plugins }),
    );
    expect(blocks(state).at(-1)).toBe('horizontal_rule');
    state = state.apply(state.tr.insertText('!'));
    expect(blocks(state).slice(-2)).toEqual(['horizontal_rule', 'paragraph']);
    const again = state.apply(state.tr.insertText('?'));
    expect(blocks(again)).toEqual(blocks(state));
  });

  it('DOCE-EDITING-10.3 is off by default', () => {
    const plugins = createDocumentEditing(documentSchema);
    let state = atFirstEnd(
      EditorState.create({ doc: docOf(paragraph('Text'), { type: 'rule' }), plugins }),
    );
    state = state.apply(state.tr.insertText('!'));
    expect(blocks(state).at(-1)).toBe('horizontal_rule');
  });
});
