import { undo } from 'prosemirror-history';
import { EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { readDocumentFile, type StoredNode, writeDocumentFile } from '../model/index.js';
import { createDocumentEditing } from './document-editing.js';
import { markRemote } from './transaction-kind.js';
import { contentLimitOf, documentCounts } from './writing-helpers.js';

const docOf = (...content: StoredNode[]) =>
  readDocumentFile({ formatVersion: 1, sections: [{ name: null, content }] }, documentSchema).doc;

const paragraph = (text: string): StoredNode => ({
  type: 'paragraph',
  content: text ? [{ type: 'text', text }] : [],
});

const textOf = (state: EditorState) => state.doc.textBetween(0, state.doc.content.size);

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
    expect(textOf(state.apply(state.tr.insertText('e')))).toBe('abcde');
    expect(textOf(state.apply(state.tr.insertText('ef')))).toBe('abcd');
  });

  it('DOCE-EDITING-10.2 checks the word count even when replacing text of the same or shorter length', () => {
    const plugins = createDocumentEditing(documentSchema, { limit: { words: 1 } });
    const state = atFirstEnd(EditorState.create({ doc: docOf(paragraph('abcde')), plugins }));
    const end = state.selection.from;
    const splitWord = (to: number) => state.tr.insertText(' ', end - 3, to);
    expect(textOf(state.apply(splitWord(end - 2)))).toBe('abcde');
    expect(textOf(state.apply(splitWord(end - 1)))).toBe('abcde');
    expect(textOf(state.apply(markRemote(splitWord(end - 1))))).toBe('ab e');
  });

  it('DOCE-EDITING-10.2 checks each configured limit when a remote change is already over one', () => {
    const plugins = createDocumentEditing(documentSchema, {
      limit: { words: 1, characters: 9 },
    });
    const state = atFirstEnd(EditorState.create({ doc: docOf(paragraph('abcde')), plugins }));
    const remote = state.apply(markRemote(state.tr.insertText(' fg')));
    expect(textOf(remote.apply(remote.tr.insertText('h')))).toBe('abcde fgh');
    expect(textOf(remote.apply(remote.tr.insertText('hi')))).toBe('abcde fg');
    expect(textOf(remote.apply(remote.tr.insertText(' h')))).toBe('abcde fg');
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

  it('DOCE-EDITING-10.3 adds no paragraph after a remote change or where the end is locked', () => {
    const doc = docOf(paragraph('Text'), { type: 'rule' });
    const remote = atFirstEnd(
      EditorState.create({
        doc,
        plugins: createDocumentEditing(documentSchema, { trailingParagraph: true }),
      }),
    );
    expect(blocks(remote.apply(markRemote(remote.tr.insertText('!')))).at(-1)).toBe(
      'horizontal_rule',
    );
    let rule = 0;
    doc.descendants((node, pos) => {
      if (node.type.name === 'horizontal_rule') rule = pos;
    });
    const plugins = createDocumentEditing(documentSchema, {
      trailingParagraph: true,
      isLocked: (_doc, pos) => pos > rule,
    });
    let locked = atFirstEnd(EditorState.create({ doc, plugins }));
    locked = locked.apply(locked.tr.insertText('!'));
    expect(locked.doc.textBetween(0, locked.doc.content.size)).toBe('Text!');
    expect(blocks(locked).at(-1)).toBe('horizontal_rule');
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

describe('a paragraph in an emptied section', () => {
  // Two sections, the second one paragraph: everything in it is deleted.
  const twoSections = () =>
    readDocumentFile(
      {
        formatVersion: 1,
        sections: [
          { name: null, content: [paragraph('First')] },
          { name: null, content: [paragraph('Second'), { type: 'rule' }] },
        ],
      },
      documentSchema,
    ).doc;
  const emptied = (state: EditorState) => {
    const page = state.doc.child(1).child(0);
    const start = state.doc.child(0).nodeSize + 2 + (page.child(0).nodeSize ?? 0) + 1;
    return state.tr.delete(start, start + (page.child(1).content.size ?? 0));
  };
  const second = (state: EditorState) => state.doc.child(1).child(0).child(1);

  it('DOCE-EDITING-10.4 leaves one empty paragraph, as the stored form reads back, undone with the edit', () => {
    const plugins = createDocumentEditing(documentSchema);
    let state = EditorState.create({ doc: twoSections(), plugins });
    const before = state.doc;
    state = state.apply(emptied(state));
    expect(second(state).childCount).toBe(1);
    expect(second(state).firstChild?.type.name).toBe('paragraph');
    expect(second(state).firstChild?.content.size).toBe(0);
    const read = readDocumentFile(writeDocumentFile(state.doc), documentSchema).doc;
    expect(second({ doc: read } as EditorState).childCount).toBe(1);
    let undone = state;
    undo(state, (tr) => (undone = state.apply(tr)));
    // Element ids the first edit assigned stay; the blocks and their text come back.
    const shape = (doc: typeof before) => {
      const found: string[] = [];
      second({ doc } as EditorState).forEach((node) =>
        found.push(`${node.type.name}:${node.textContent}`),
      );
      return found;
    };
    expect(shape(undone.doc)).toEqual(shape(before));
  });

  it('DOCE-EDITING-10.4 adds none after a remote change', () => {
    const plugins = createDocumentEditing(documentSchema);
    let state = EditorState.create({ doc: twoSections(), plugins });
    state = state.apply(markRemote(emptied(state)));
    expect(second(state).childCount).toBe(0);
  });
});
