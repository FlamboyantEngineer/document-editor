import { EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { readDocumentFile, type StoredNode } from '../model/index.js';
import { documentOutline } from './outline.js';

const heading = (id: string, level: number, value: string): StoredNode => ({
  type: 'heading',
  attrs: { id, level },
  content: [{ type: 'text', text: value }],
});
const paragraph = (value: string): StoredNode => ({
  type: 'paragraph',
  content: [{ type: 'text', text: value }],
});

describe('outline', () => {
  it('DOCE-OUTLINE-1.1 lists the headings with the one the selection is under', () => {
    const doc = readDocumentFile(
      {
        formatVersion: 1,
        sections: [
          {
            name: null,
            content: [
              heading('a1a1a1a1', 1, 'Scope'),
              paragraph('First'),
              heading('b2b2b2b2', 2, 'Detail'),
              paragraph('Second'),
            ],
          },
        ],
      },
      documentSchema,
    );
    let state = EditorState.create({ doc });
    let second = -1;
    doc.descendants((node, pos) => {
      if (node.isText && node.text === 'Second') second = pos;
    });
    state = state.apply(state.tr.setSelection(TextSelection.create(doc, second)));
    expect(documentOutline(state)).toEqual([
      { elementId: 'a1a1a1a1', level: 1, text: 'Scope', pos: expect.any(Number), active: false },
      { elementId: 'b2b2b2b2', level: 2, text: 'Detail', pos: expect.any(Number), active: true },
    ]);
  });
});
