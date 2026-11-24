// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { readRegressionDocument } from '../../test/stored-fixtures.js';
import type { DocumentFile } from '../model/index.js';
import { acceptedDocumentText } from './accepted-text.js';
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

  it('DOCE-FORMAT-9.2 leaves out a deleted table and keeps a note only where it is still cited', () => {
    const text = (value: string) => ({ type: 'text', text: value });
    const deletion = [{ type: 'deletion', attrs: { id: 'd0000002' } }];
    const file: DocumentFile = {
      formatVersion: 1,
      sections: [
        {
          content: [
            {
              type: 'table',
              attrs: { suggestionKind: 'deletion', suggestionId: 'd0000001' },
              content: [
                { type: 'caption', content: [text('Deleted caption')] },
                {
                  type: 'tableRow',
                  content: [
                    {
                      type: 'tableCell',
                      content: [{ type: 'paragraph', content: [text('Deleted cell')] }],
                    },
                  ],
                },
              ],
            },
            {
              type: 'paragraph',
              content: [
                text('Body'),
                {
                  type: 'footnote',
                  attrs: { id: 'a0000001' },
                  marks: deletion,
                  content: [text('Removed note')],
                },
                {
                  type: 'footnote',
                  attrs: { id: 'a0000002' },
                  marks: deletion,
                  content: [text('Shared note')],
                },
                { type: 'footnote', attrs: { id: 'a0000002' }, content: [text('Shared note')] },
              ],
            },
          ],
        },
      ],
    };
    expect(storedDocumentText(file, documentSchema)).toBe('Body\nShared note');
  });

  it('DOCE-FORMAT-9.2 keeps one note body while any of its two markers survive acceptance', () => {
    const schema = documentSchema;
    const id = { footnoteId: 'shared' };
    const deletion = schema.marks.deletion?.create({ dataId: 'd0000001' });
    if (!deletion) throw new Error('Expected a deletion mark');
    const marker = schema.node('footnote_reference', id);
    const deleted = marker.mark([deletion]);
    const body = schema.node('footnote_entry', id, schema.text('Shared note'));
    const documentWith = (second: typeof marker) =>
      schema.node('doc', null, [
        schema.node('page_section', null, [
          schema.node('page', null, [
            schema.node('page_header'),
            schema.node('page_content', null, [
              schema.node('paragraph', null, [schema.text('First paragraph'), deleted]),
              schema.node('paragraph', null, [schema.text('Second paragraph'), second]),
            ]),
            schema.node('page_footnotes', null, [body]),
            schema.node('page_footer'),
          ]),
        ]),
      ]);
    expect(acceptedDocumentText(documentWith(marker))).toBe(
      'First paragraph\nSecond paragraph\nShared note',
    );
    expect(acceptedDocumentText(documentWith(deleted))).toBe('First paragraph\nSecond paragraph');
  });

  it('DOCE-FORMAT-9.2 reads the captions objects show and the code linked code holds', () => {
    expect(storedDocumentText(readRegressionDocument('figures'), documentSchema)).toContain(
      'Plot plan of the north beds\nWater flow',
    );
    expect(
      storedDocumentText(readRegressionDocument('linked-code'), documentSchema).split('\n'),
    ).toContain('line 3: reading = sensor.read(2)');
    expect(
      storedDocumentText(readRegressionDocument('table-simple'), documentSchema).split('\n')[1],
    ).toBe('Weekly rainfall');
    const hidden: DocumentFile = {
      formatVersion: 1,
      sections: [
        {
          name: null,
          content: [
            {
              type: 'codeBlock',
              attrs: { id: 'a0000001', captionEnabled: false },
              content: [
                { type: 'caption', content: [{ type: 'text', text: 'Hidden caption' }] },
                { type: 'text', text: 'const shown = 1;' },
              ],
            },
          ],
        },
      ],
    };
    expect(storedDocumentText(hidden, documentSchema)).toBe('const shown = 1;');
  });
});
