import { EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { readDocumentFile } from '../../model/index.js';
import { contentLinkAddress, copyContentLink } from './copy-link.js';

const { doc } = readDocumentFile(
  {
    formatVersion: 1,
    sections: [
      {
        name: null,
        content: [
          {
            type: 'paragraph',
            attrs: { id: 'c0000001' },
            content: [{ type: 'text', text: 'Alpha beta' }],
          },
          { type: 'paragraph', content: [{ type: 'text', text: 'No id' }] },
        ],
      },
    ],
  },
  documentSchema,
);

function at(from: number, to = from) {
  const state = EditorState.create({ doc });
  return state.apply(state.tr.setSelection(TextSelection.create(doc, from, to)));
}

function positionOf(value: string): number {
  let found = -1;
  doc.descendants((node, pos) => {
    if (found < 0 && node.isText && node.text?.includes(value))
      found = pos + node.text.indexOf(value);
    return found < 0;
  });
  return found;
}

describe('contentLinkAddress', () => {
  it('DOCE-EDITOR-3.9 names the block holding the caret, without offsets', () => {
    expect(contentLinkAddress(at(positionOf('beta')))).toEqual({ elementId: 'c0000001' });
  });

  it('DOCE-EDITOR-3.9 names the selected text by its offsets in the block', () => {
    const from = positionOf('beta');
    expect(contentLinkAddress(at(from, from + 4))).toEqual({
      elementId: 'c0000001',
      from: 6,
      to: 10,
    });
  });

  it('DOCE-EDITOR-3.9 hands the host nothing outside an element with an id', () => {
    const onCopyLink = vi.fn();
    copyContentLink({ state: at(positionOf('No id')) }, onCopyLink);
    expect(onCopyLink).not.toHaveBeenCalled();
    copyContentLink({ state: at(positionOf('Alpha')) }, onCopyLink);
    expect(onCopyLink).toHaveBeenCalledWith({ elementId: 'c0000001' });
  });
});
