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
              ],
            },
          ],
        },
      ],
    },
    documentSchema,
  ).doc;

describe('authorship', () => {
  it('DOCE-COLLAB-3.1 tells who wrote what, and marks each writer while shown', () => {
    const authors = documentAuthors(doc());
    expect(authors.map(({ id, characters }) => [id, characters])).toEqual([
      ['ada', 'Written by Ada, '.length],
      ['agent', 'by the agent'.length],
    ]);
    expect(new Set(authors.map((author) => author.slot)).size).toBe(2);
    let state = EditorState.create({ doc: doc(), plugins: [createAuthorship()] });
    expect(isAuthorshipShown(state)).toBe(false);
    showAuthorship(true)(state, (tr) => (state = state.apply(tr)));
    expect(isAuthorshipShown(state)).toBe(true);
    const found = state.plugins[0]?.getState(state) as { decorations: { find: () => unknown[] } };
    expect(found.decorations.find()).toHaveLength(2);
    expect(showAuthorship(true)(state)).toBe(false);
  });
});
