import { EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { readDocumentFile, type StoredNode } from '../model/index.js';
import { documentStatistics } from './document-statistics.js';

const text = (value: string): StoredNode => ({ type: 'text', text: value });
const paragraph = (...content: StoredNode[]): StoredNode => ({ type: 'paragraph', content });
const footnote: StoredNode = { type: 'footnote', attrs: { id: 'n1' }, content: [text('A note')] };
const cell = (type: 'tableCell' | 'tableHeader', value: string): StoredNode => ({
  type,
  content: [paragraph(text(value))],
});

function stateOf(...sections: StoredNode[][]) {
  const doc = readDocumentFile(
    { formatVersion: 1, sections: sections.map((content) => ({ name: null, content })) },
    documentSchema,
  ).doc;
  return EditorState.create({ doc });
}

function at(state: EditorState, value: string, length = 0) {
  let found = -1;
  state.doc.descendants((node, pos) => {
    if (found < 0 && node.isText && node.text?.includes(value)) {
      found = pos + (node.text.indexOf(value) ?? 0);
    }
    return found < 0;
  });
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, found, found + length)));
}

describe('document statistics', () => {
  it('DOCE-EDITOR-5.2 counts the pages, the page holding the caret and the words of the body and footnotes', () => {
    const state = stateOf(
      [paragraph(text('One two three'))],
      [paragraph(text('Four five'), footnote, text(' six'))],
    );
    expect(documentStatistics(state)).toEqual({
      pages: 2,
      page: 1,
      words: 8,
      selectedWords: null,
    });
    expect(documentStatistics(at(state, 'five')).page).toBe(2);
  });

  it('DOCE-EDITOR-5.2 counts the selected words', () => {
    const state = at(stateOf([paragraph(text('One two three four'))]), 'two', 'two three'.length);
    expect(documentStatistics(state).selectedWords).toBe(2);
  });

  it('DOCE-EDITOR-5.2 leaves out the header rows a later part of a split table repeats', () => {
    const state = stateOf([
      {
        type: 'table',
        content: [
          { type: 'tableRow', content: [cell('tableHeader', 'Name')] },
          { type: 'tableRow', content: [cell('tableCell', 'First')] },
        ],
      },
    ]);
    // A second part of the table, repeating its header row, after the first.
    let after = -1;
    state.doc.descendants((node, pos) => {
      if (node.type.name === 'table') after = pos + node.nodeSize;
      return after < 0;
    });
    const table = state.doc.resolve(after).nodeBefore;
    if (!table) throw new Error('The document has a table');
    const part = table.type.create({ ...table.attrs, splitPartIndex: 1 }, table.content);
    const both = state.apply(state.tr.insert(after, part));
    expect(documentStatistics(both).words).toBe(3);
  });
});
