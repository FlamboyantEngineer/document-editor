import { EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { parseMarkup } from '../../../test/document-markup.js';
import { blockStyle } from './block-styles.js';

const selected = (markup: string, from: number, to: number) => {
  const doc = parseMarkup(markup);
  return EditorState.create({ doc, selection: TextSelection.create(doc, from, to) });
};

describe('the text style shown', () => {
  it('DOCE-EDITOR-4.1 shows the style every selected block shares, and none for a mix', () => {
    // Two second-level headings: "One" at 1 to 4, "Two" at 6 to 9.
    expect(blockStyle(selected('<h2>One</h2><h2>Two</h2>', 2, 8))).toBe('heading-2');
    expect(blockStyle(selected('<h2>One</h2><p>Two</p>', 2, 8))).toBeNull();
    expect(blockStyle(selected('<p>One</p><p>Two</p>', 2, 8))).toBe('paragraph');
  });
});
