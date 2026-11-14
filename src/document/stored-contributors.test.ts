// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readRegressionDocument } from '../../test/stored-fixtures.js';
import type { DocumentFile, StoredNode } from '../model/index.js';
import { storedContributors } from './stored-contributors.js';

const withBlocks = (file: DocumentFile, blocks: (content: StoredNode[]) => StoredNode[]) => ({
  ...file,
  sections: file.sections.map((section) => ({ ...section, content: blocks(section.content) })),
});

describe('storedContributors', () => {
  it('DOCE-FORMAT-9.10 lists the writers of a stored document in reading order', () => {
    expect(typeof document).toBe('undefined');
    const file = readRegressionDocument('authorship');
    expect(storedContributors(file)).toEqual(['person-01', 'person-02', 'person-03']);
  });

  it('DOCE-FORMAT-9.10 lists suggestion writers from their marks', () => {
    const file: DocumentFile = {
      formatVersion: 1,
      sections: [
        {
          name: null,
          content: [
            {
              type: 'paragraph',
              attrs: { id: 'a0000001' },
              content: [
                {
                  type: 'text',
                  text: 'Added',
                  marks: [{ type: 'insertion', attrs: { thread: 't-1', author: 'person-04' } }],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(storedContributors(file)).toEqual(['person-04']);
  });

  it('DOCE-FORMAT-9.10 lists only the writers of what changed since an earlier version', () => {
    const since = readRegressionDocument('authorship');
    expect(storedContributors(since, { since })).toEqual([]);
    const later = withBlocks(since, (content) => [
      ...content.map((block) =>
        block.attrs?.id === '056ff603'
          ? {
              ...block,
              content: [
                ...(block.content ?? []),
                {
                  type: 'text',
                  text: ' Edited.',
                  marks: [{ type: 'contributor', attrs: { author: 'person-05' } }],
                },
              ],
            }
          : block,
      ),
      {
        type: 'paragraph',
        attrs: { id: 'a0000009', author: 'person-06' },
        content: [{ type: 'text', text: 'New.' }],
      },
    ]);
    expect(storedContributors(later, { since })).toEqual(['person-02', 'person-05', 'person-06']);
  });
});
