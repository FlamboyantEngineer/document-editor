import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { BASE_TEMPLATE, catalogDocument, readDocumentFile, type StoredNode } from '../index.js';

const cite = (value: string, attrs: Record<string, unknown>): StoredNode => ({
  type: 'text',
  text: value,
  marks: [{ type: 'reference', attrs: { referenceType: 'external-document', ...attrs } }],
});

// The references list of a paragraph that cites each of these.
function references(...citations: StoredNode[]) {
  const doc = readDocumentFile(
    {
      formatVersion: 1,
      sections: [
        {
          name: null,
          content: [
            {
              type: 'paragraph',
              content: citations.flatMap((citation) => [citation, { type: 'text', text: ' ' }]),
            },
          ],
        },
      ],
    },
    documentSchema,
  ).doc;
  return (catalogDocument(doc, BASE_TEMPLATE).references ?? []).map(
    ({ number, text, group }) => `${group ?? ''}|${number}|${text}`,
  );
}

describe('a list of references', () => {
  it('DOCE-CONTENTS-1.9 shows a document by its publisher, number with revision and title', () => {
    expect(
      references(
        cite('the guide', {
          publisher: 'ABC',
          number: 'AG 20-1',
          revision: 'B',
          title: 'Assurance guide',
          target: 'd1',
        }),
        // A number that names its publisher, or ends in its revision, does not repeat it.
        cite('the standard', {
          publisher: 'XYZ',
          number: 'XYZ 9001D',
          revision: 'D',
          title: 'Quality systems',
          target: 'd2',
        }),
        cite('the paper', {
          authors: 'Doe, Jane & Roe, Rick',
          revision: '2018',
          title: 'Partial results',
          pages: '1-4',
          number: '10.1000/xyz.1',
          target: 'd3',
        }),
        cite('the formatted one', {
          target: 'd4',
          number: 'F-1',
          baseline: JSON.stringify({
            version: 1,
            documentId: 'd4',
            numbering: 'F-1',
            title: 'Formatted',
            revision: null,
            revisionLabel: '',
            target: null,
            defaultLabel: 'F-1',
            bibliographyLabel: 'F-1, as the template formats it',
          }),
        }),
        // A citation that recorded none of its parts reads as its text, after the numbered ones.
        cite('an old citation', { target: 'd5' }),
      ),
    ).toEqual([
      'external-document||Doe, Jane & Roe, Rick. (2018). Partial results. 1-4. 10.1000/xyz.1.',
      'external-document||F-1, as the template formats it',
      'external-document|ABC AG 20-1 B|Assurance guide',
      'external-document|XYZ 9001D|Quality systems',
      'external-document||an old citation',
    ]);
  });

  it('DOCE-CONTENTS-1.9 lists each revision once, grouped by type, by publisher and number', () => {
    const standard = (revision: string, target = 's1') =>
      cite(`the standard ${revision}`, {
        publisher: 'XYZ',
        number: 'S-10',
        revision,
        title: 'Signals',
        target,
      });
    expect(
      references(
        cite('the catalogue entry', {
          referenceType: 'catalogue-entry',
          publisher: 'ABC',
          number: 'C-1',
          title: 'Catalogued',
          target: 'c1',
        }),
        standard('B'),
        standard('A'),
        standard('B'),
        cite('another', { publisher: 'ABC', number: 'Z-2', title: 'Another', target: 'a1' }),
      ),
    ).toEqual([
      'external-document|ABC Z-2|Another',
      'external-document|XYZ S-10 A|Signals',
      'external-document|XYZ S-10 B|Signals',
      'catalogue-entry|ABC C-1|Catalogued',
    ]);
  });
});
