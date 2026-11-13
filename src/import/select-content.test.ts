import { describe, expect, it } from 'vitest';
import type { DocumentFile, StoredNode } from '../model/format/document-format.js';
import { selectStoredContent } from './select-content.js';

const heading = (id: string, level?: number): StoredNode => ({
  type: 'heading',
  attrs: { id, ...(level ? { level } : {}) },
  content: [{ type: 'text', text: id }],
});
const paragraph = (id: string): StoredNode => ({ type: 'paragraph', attrs: { id } });

const FILE: DocumentFile = {
  formatVersion: 1,
  sections: [
    { id: 's1', name: 'summary', content: [paragraph('p0')] },
    {
      name: 'body',
      content: [
        heading('h1'),
        paragraph('p1'),
        heading('h2', 2),
        paragraph('p2'),
        heading('h3', 3),
        paragraph('p3'),
        heading('h4', 2),
        heading('h5'),
        paragraph('p5'),
      ],
    },
  ],
};

const ids = (content: StoredNode[] | null) => content?.map((node) => node.attrs?.id) ?? null;

describe('selecting stored content', () => {
  it('DOCE-IMPORT-3.4 takes a section by its id or name', () => {
    expect(ids(selectStoredContent(FILE, { section: 's1' }))).toEqual(['p0']);
    expect(ids(selectStoredContent(FILE, { section: 'body' }))).toHaveLength(9);
    expect(selectStoredContent(FILE, { section: 'annex' })).toBeNull();
  });

  it('DOCE-IMPORT-3.4 takes a heading with the blocks under it', () => {
    expect(ids(selectStoredContent(FILE, { heading: 'h2' }))).toEqual(['h2', 'p2', 'h3', 'p3']);
    expect(ids(selectStoredContent(FILE, { heading: 'h1' }))).toEqual([
      'h1',
      'p1',
      'h2',
      'p2',
      'h3',
      'p3',
      'h4',
    ]);
    expect(ids(selectStoredContent(FILE, { heading: 'h5' }))).toEqual(['h5', 'p5']);
    expect(selectStoredContent(FILE, { heading: 'p1' })).toBeNull();
  });

  it('DOCE-IMPORT-3.4 gives a copy the caller may change', () => {
    const taken = selectStoredContent(FILE, { heading: 'h5' });
    taken?.pop();
    expect(FILE.sections[1]?.content).toHaveLength(9);
  });
});
