import { EditorState } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { readDocumentFile } from '../model/index.js';
import {
  createAuthorship,
  documentAuthors,
  isAuthorshipShown,
  showAuthorship,
} from './authorship.js';

const doc = () =>
  readDocumentFile(
    {
      formatVersion: 1,
      sections: [
        {
          name: null,
          content: [
            {
              type: 'paragraph',
              attrs: { author: 'ada' },
              content: [
                { type: 'text', text: 'Written by Ada, ' },
                {
                  type: 'text',
                  text: 'by the agent',
                  marks: [{ type: 'contributor', attrs: { author: 'agent' } }],
                },
                {
                  type: 'text',
                  text: ' and generated',
                  marks: [{ type: 'contributor', attrs: { author: 'agent', aiSession: 's1' } }],
                },
              ],
            },
          ],
        },
      ],
    },
    documentSchema,
  ).doc;

describe('authorship', () => {
  it('DOCE-COLLAB-3.1 tells who wrote what, and marks each writer and generated text while shown', () => {
    const authors = documentAuthors(doc());
    expect(authors.map(({ id, characters }) => [id, characters])).toEqual([
      ['agent', 'by the agent and generated'.length],
      ['ada', 'Written by Ada, '.length],
    ]);
    expect(new Set(authors.map((author) => author.slot)).size).toBe(2);
    let state = EditorState.create({ doc: doc(), plugins: [createAuthorship()] });
    expect(isAuthorshipShown(state)).toBe(false);
    showAuthorship(true)(state, (tr) => (state = state.apply(tr)));
    expect(isAuthorshipShown(state)).toBe(true);
    type Found = { spec: unknown; type: { attrs: Record<string, string> } };
    const found = state.plugins[0]?.getState(state) as { decorations: { find: () => Found[] } };
    const marked = found.decorations.find().map((each) => each.type.attrs);
    expect(marked).toHaveLength(3);
    // Only the text with the agent's session reads as generated.
    expect(marked.map((attrs) => attrs['data-author-source'] ?? null)).toEqual([
      null,
      null,
      'generated',
    ]);
    expect(showAuthorship(true)(state)).toBe(false);
  });
});
