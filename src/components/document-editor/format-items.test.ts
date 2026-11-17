import { EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { documentSchema, parseMarkup } from '../../../test/document-markup.js';
import { isMarkActive } from './format-items.js';

const strong = documentSchema.marks.strong;

// A state with `from` to `to` selected in a paragraph of `markup`.
function selected(markup: string, from: number, to: number) {
  const doc = parseMarkup(markup);
  return EditorState.create({ doc, selection: TextSelection.create(doc, from, to) });
}

describe('format buttons', () => {
  it('DOCE-EDITOR-4.1 presses a format over a range only when all of its text has it', () => {
    if (!strong) throw new Error('No strong mark.');
    // "Bold plain": positions 1 to 5 are bold, 6 to 11 plain.
    expect(isMarkActive(selected('<p><strong>Bold</strong> plain</p>', 1, 5), strong)).toBe(true);
    expect(isMarkActive(selected('<p><strong>Bold</strong> plain</p>', 1, 8), strong)).toBe(false);
    expect(isMarkActive(selected('<p><strong>Bold</strong> plain</p>', 6, 11), strong)).toBe(false);
  });

  it('DOCE-EDITOR-4.1 presses a format at a caret by the marks the next typing takes', () => {
    if (!strong) throw new Error('No strong mark.');
    expect(isMarkActive(selected('<p><strong>Bold</strong> plain</p>', 3, 3), strong)).toBe(true);
    const state = selected('<p><strong>Bold</strong> plain</p>', 8, 8);
    expect(isMarkActive(state, strong)).toBe(false);
    expect(isMarkActive(state.apply(state.tr.addStoredMark(strong.create())), strong)).toBe(true);
  });
});
