import { EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { readDocumentFile, type StoredNode } from '../model/index.js';
import { createPageMap } from '../pagination/page-map.js';
import { documentStatistics } from './document-statistics.js';

const text = (value: string): StoredNode => ({ type: 'text', text: value });
const paragraph = (...content: StoredNode[]): StoredNode => ({ type: 'paragraph', content });
const footnote: StoredNode = { type: 'footnote', attrs: { id: 'n1' }, content: [text('A note')] };

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

  it('DOCE-EDITOR-5.2 counts the pages it is given, as a projection lays them out', () => {
    const state = stateOf([paragraph(text('One'))]);
    const laidOut = stateOf([paragraph(text('One'))], [paragraph(text('Two'))], [paragraph()]);
    expect(documentStatistics(state).pages).toBe(1);
    expect(documentStatistics(state, createPageMap(laidOut.doc)).pages).toBe(3);
  });

  it('DOCE-EDITOR-5.2 counts the selected words', () => {
    const state = at(stateOf([paragraph(text('One two three four'))]), 'two', 'two three'.length);
    expect(documentStatistics(state).selectedWords).toBe(2);
  });
});
