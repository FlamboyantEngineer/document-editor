import { EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { characterWidth } from './graphemes.js';
import { deleteCharacter } from './projection-input.js';

const FAMILY = '\u{1F468}‍\u{1F469}‍\u{1F467}';
const FLAG = '\u{1F1EB}\u{1F1F7}';
const ACCENTED = 'é';

// A paragraph of `text` with the caret `at` characters into it.
function caretIn(text: string, at: number) {
  const paragraph = documentSchema.node('paragraph', null, [documentSchema.text(text)]);
  const doc = documentSchema.node('doc', null, [
    documentSchema.node('page_section', null, [
      documentSchema.node('page', null, [
        documentSchema.node('page_header'),
        documentSchema.node('page_content', null, [paragraph]),
        documentSchema.node('page_footnotes'),
        documentSchema.node('page_footer'),
      ]),
    ]),
  ]);
  let start = 0;
  doc.descendants((node, pos) => {
    if (node.type.name === 'paragraph') start = pos + 1;
    return start === 0;
  });
  const state = EditorState.create({ doc });
  return state.apply(state.tr.setSelection(TextSelection.create(doc, start + at)));
}

const deleted = (state: EditorState, direction: -1 | 1) => {
  let after = state;
  deleteCharacter(direction)(state, (tr) => {
    after = state.apply(tr);
  });
  return after.doc.textContent;
};

describe('characters on the pages', () => {
  it('DOCE-PAGINATION-7.11 deletes a whole grapheme cluster, as the browser does', () => {
    expect(deleted(caretIn(`a${FAMILY}b`, 1 + FAMILY.length), -1)).toBe('ab');
    expect(deleted(caretIn(`a${FLAG}b`, 1), 1)).toBe('ab');
    expect(deleted(caretIn(`x${ACCENTED}y`, 1), 1)).toBe('xy');
    expect(deleted(caretIn('abc', 1), 1)).toBe('ac');
  });

  it('DOCE-PAGINATION-7.11 measures the character beside a position by its cluster', () => {
    const state = caretIn(`${FLAG}z`, FLAG.length);
    expect(characterWidth(state.selection.$head, -1)).toBe(FLAG.length);
    expect(characterWidth(state.selection.$head, 1)).toBe(1);
  });
});
