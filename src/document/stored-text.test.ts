// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { readRegressionDocument } from '../../test/stored-fixtures.js';
import type { DocumentFile } from '../model/index.js';
import { storedDocumentText } from './stored-text.js';

describe('storedDocumentText', () => {
  it('DOCE-FORMAT-9.2 reads a line per text block, with suggestions as if accepted', () => {
    expect(typeof document).toBe('undefined');
    expect(
      storedDocumentText(readRegressionDocument('comments-and-suggestions'), documentSchema),
    ).toBe(
      [
        'Comments',
        'A commented phrase and a resolved one.',
        'Text with an insertion and .',
        'Overlapping comment.',
        'A paragraph split by a suggestion.',
      ].join('\n'),
    );
  });

  it('DOCE-FORMAT-9.2 reads inline objects as the text they show and footnotes after the content', () => {
    const people = storedDocumentText(
      readRegressionDocument('people-and-abbreviations'),
      documentSchema,
    );
    expect(people.split('\n').slice(0, 2)).toEqual([
      'Assigned to @Alex Doe and @Sam Roe.',
      'Measured by the automatic weather station (AWS), then the AWS.',
    ]);
    const notes = storedDocumentText(
      readRegressionDocument('footnotes-in-structures'),
      documentSchema,
    );
    expect(notes.split('\n').slice(-4)).toEqual([
      'An empty note after this text.',
      'Note in a list.',
      'Measured at the gate.',
      'Note in a quote.',
    ]);
  });

  it('DOCE-FORMAT-9.2 keeps line breaks, leaves out empty blocks and drops what it cannot read', () => {
    const file: DocumentFile = {
      formatVersion: 1,
      sections: [
        { name: null, content: [] },
        {
          name: null,
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'North' },
                { type: 'lineBreak' },
                { type: 'text', text: 'gate' },
              ],
            },
            { type: 'hostWidget', content: [{ type: 'text', text: 'Hidden' }] },
          ],
        },
      ],
    };
    expect(storedDocumentText(file, documentSchema)).toBe('North\ngate');
  });
});
