import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { characterWidth } from './graphemes.js';
import { deleteCharacter } from './projection-input.js';

const FAMILY = '\u{1F468}‍\u{1F469}‍\u{1F467}';
const FLAG = '\u{1F1EB}\u{1F1F7}';
const ACCENTED = 'é';
// Four people with skin tones: 19 UTF-16 units, longer than any first window.
const TONED_FAMILY = '👨🏽‍👩🏾‍👧🏿‍👦🏻';
const ACCENTS = `q${'\u0301'.repeat(40)}`;

// A paragraph with the caret at a content offset.
function caretIn(content: string | readonly ProseMirrorNode[], at: number) {
  const paragraph = documentSchema.node(
    'paragraph',
    null,
    typeof content === 'string' ? documentSchema.text(content) : content,
  );
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

  it('DOCE-PAGINATION-7.11 deletes a cluster of any length whole, either way', () => {
    const text = `A${TONED_FAMILY}Z`;
    expect(deleted(caretIn(text, 1 + TONED_FAMILY.length), -1)).toBe('AZ');
    expect(deleted(caretIn(text, 1), 1)).toBe('AZ');
    expect(deleted(caretIn(`${ACCENTS}x`, ACCENTS.length), -1)).toBe('x');
    expect(deleted(caretIn(`x${ACCENTS}`, 1), 1)).toBe('x');
    const state = caretIn(text, 1);
    expect(characterWidth(state.selection.$head, 1)).toBe(TONED_FAMILY.length);
  });

  it('DOCE-PAGINATION-7.11 deletes a whole inline equation beside the caret in both directions', () => {
    const math = documentSchema.node('math_inline', null, [documentSchema.text('x + y')]);
    const content = [documentSchema.text('A'), math, documentSchema.text('B')];
    const before = caretIn(content, 1);
    const after = caretIn(content, 1 + math.nodeSize);
    expect(characterWidth(before.selection.$head, 1)).toBe(math.nodeSize);
    expect(characterWidth(after.selection.$head, -1)).toBe(math.nodeSize);
    expect(deleted(before, 1)).toBe('AB');
    expect(deleted(after, -1)).toBe('AB');
  });

  it('DOCE-PAGINATION-7.11 keeps literal object characters and marks in text clusters', () => {
    const literal = '\uFFFC\u0301\u0323';
    expect(deleted(caretIn(`A${literal}B`, 1), 1)).toBe('AB');
    expect(deleted(caretIn(`A${literal}B`, 1 + literal.length), -1)).toBe('AB');

    const math = documentSchema.node('math_inline', null, [documentSchema.text('x')]);
    const content = [math, documentSchema.text('\u0301\u0323B')];
    expect(deleted(caretIn(content, math.nodeSize + 2), -1)).toBe('xB');
  });
});
