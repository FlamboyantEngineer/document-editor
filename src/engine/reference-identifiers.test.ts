import { EditorState } from 'prosemirror-state';
import { DecorationSet } from 'prosemirror-view';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { readDocumentFile, type ReferenceBaseline } from '../model/index.js';
import { createReferenceIdentifiers, referenceIdentifiers } from './reference-identifiers.js';

const CITED: ReferenceBaseline = {
  version: 1,
  documentId: 'doc-7',
  numbering: 'PWR-100',
  title: 'Power interface',
  revision: { majorRevision: 'B', minorRevision: null },
  revisionLabel: 'Rev B',
  target: {
    id: 'table-1',
    kind: 'table',
    stable: true,
    numbering: 'Table 2.1',
    title: 'Limits',
    label: 'Table 2.1 - Limits',
  },
  defaultLabel: 'PWR-100',
};

function stateOf(citation: string) {
  const doc = readDocumentFile(
    {
      formatVersion: 1,
      sections: [
        {
          name: null,
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'See ' },
                {
                  type: 'text',
                  text: citation,
                  marks: [
                    {
                      type: 'reference',
                      attrs: {
                        referenceType: 'external-document',
                        baseline: JSON.stringify(CITED),
                        target: 'table-1',
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    documentSchema,
  ).doc;
  return EditorState.create({ doc, plugins: [createReferenceIdentifiers()] });
}

// The identifiers the plugin marks, as the view draws them.
function identified(state: EditorState) {
  const drawn = state.plugins[0]?.props.decorations?.call(state.plugins[0], state);
  const set = drawn instanceof DecorationSet ? drawn : DecorationSet.empty;
  const marked = set.find().map((each) => state.doc.textBetween(each.from, each.to));
  expect(referenceIdentifiers(state.doc).find()).toHaveLength(marked.length);
  return marked;
}

describe('citation identifiers', () => {
  it('DOCE-REFERENCES-1.13 keeps the document number, revision and target number of a citation whole', () => {
    const state = stateOf('PWR-100 - Power interface Rev B, Table 2.1');
    expect(identified(state)).toEqual(['PWR-100', 'Rev B', 'Table 2.1']);
    // Typing elsewhere moves them with the text.
    const typed = state.apply(state.tr.insertText('Now ', 1));
    expect(identified(typed)).toEqual(['PWR-100', 'Rev B', 'Table 2.1']);
    // A part the citation does not read is not marked.
    expect(identified(stateOf('[PWR-100]'))).toEqual(['PWR-100']);
  });
});
