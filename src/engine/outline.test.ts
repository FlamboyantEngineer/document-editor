import { EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import {
  BASE_TEMPLATE,
  catalogDocument,
  readDocumentFile,
  type StoredNode,
} from '../model/index.js';
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
  it('DOCE-OUTLINE-1.1 DOCE-OUTLINE-1.2 lists the headings with the one the selection is under', () => {
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
    ).doc;
    let state = EditorState.create({ doc });
    let second = -1;
    doc.descendants((node, pos) => {
      if (node.isText && node.text === 'Second') second = pos;
    });
    state = state.apply(state.tr.setSelection(TextSelection.create(doc, second)));
    const entry = (elementId: string, level: number, text: string, active: boolean) => ({
      elementId,
      level,
      text,
      number: '',
      pos: expect.any(Number),
      active,
    });
    expect(documentOutline(state)).toEqual([
      entry('a1a1a1a1', 1, 'Scope', false),
      entry('b2b2b2b2', 2, 'Detail', true),
    ]);
    // DOCE-OUTLINE-1.2: numbered as the template numbers the headings.
    expect(documentOutline(state, BASE_TEMPLATE).map((each) => each.number)).toEqual([
      '1.',
      '1.1.',
    ]);
  });

  it('DOCE-OUTLINE-1.1 DOCE-CONTENTS-1.1 shows the headings the catalog numbers, and no others', () => {
    const set = (value: string, attrs: Record<string, unknown> = {}): StoredNode => ({
      type: 'heading',
      attrs: { level: 1, ...attrs },
      content: [{ type: 'text', text: value }],
    });
    const doc = readDocumentFile(
      {
        formatVersion: 1,
        sections: [
          {
            name: null,
            content: [
              set('Title', { title: true }),
              set('Scope'),
              { type: 'blockquote', content: [set('Quoted')] },
              {
                type: 'bulletList',
                content: [{ type: 'listItem', content: [paragraph('Item'), set('Listed')] }],
              },
              { type: 'script', content: [set('Output')] },
            ],
          },
        ],
      },
      documentSchema,
    );
    const state = EditorState.create({ doc });
    const catalog = catalogDocument(doc, BASE_TEMPLATE).toc ?? [];
    const outline = documentOutline(state, BASE_TEMPLATE);
    expect(outline.map((each) => [each.text, each.number])).toEqual([
      ['Scope', '1.'],
      ['Output', '2.'],
    ]);
    expect(catalog.map((each) => [each.text, each.number.trim()])).toEqual(
      outline.map((each) => [each.text, each.number]),
    );
  });
});
