import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { readDocumentFile } from '../model/index.js';
import {
  changeLinesOf,
  createChangeLines,
  setChangeLines,
  strongerChange,
} from './change-lines.js';

const doc = readDocumentFile(
  {
    formatVersion: 1,
    sections: [
      {
        name: null,
        content: [
          {
            type: 'paragraph',
            attrs: { id: 'a0000001' },
            content: [{ type: 'text', text: 'One' }],
          },
          {
            type: 'paragraph',
            attrs: { id: 'a0000002' },
            content: [{ type: 'text', text: 'Two' }],
          },
        ],
      },
    ],
  },
  documentSchema,
);

// The position of the paragraph holding a text.
function blockOf(state: EditorState, text: string): number {
  let found = -1;
  state.doc.descendants((node, pos) => {
    if (node.isTextblock && node.textContent === text) found = pos;
    return found < 0;
  });
  return found;
}

describe('change lines', () => {
  it('DOCE-VERSIONS-2.4 merges the changes on a line into the strongest', () => {
    expect(strongerChange('formatting', 'insertion')).toBe('insertion');
    expect(strongerChange('deletion', 'modification')).toBe('modification');
    expect(strongerChange('insertion', 'deletion')).toBe('insertion');
    expect(strongerChange(null, 'formatting')).toBe('formatting');
  });

  it('DOCE-VERSIONS-2.4 draws the lines set beside their block, kept where the block goes', () => {
    let state = EditorState.create({ doc, plugins: [createChangeLines()] });
    const two = blockOf(state, 'Two');
    const lines = [{ kind: 'insertion' as const, top: 18, height: 18 }];
    state = state.apply(setChangeLines(state.tr, new Map([[two, lines]])));
    const view = new EditorView(document.createElement('div'), { state });
    const bar = view.dom.querySelector<HTMLElement>('.de-change-lines .de-change-lines__line');
    expect(bar?.getAttribute('data-diff-line')).toBe('insertion');
    expect(bar?.style.getPropertyValue('--de-change-line-top')).toBe('18px');
    expect(bar?.style.getPropertyValue('--de-change-line-height')).toBe('18px');
    // Typing before the block moves its lines with it.
    view.dispatch(view.state.tr.insertText('First ', blockOf(view.state, 'One') + 1));
    expect([...changeLinesOf(view.state).keys()]).toEqual([blockOf(view.state, 'Two')]);
    view.destroy();
  });
});
