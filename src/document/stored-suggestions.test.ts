// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { readRegressionDocument } from '../../test/stored-fixtures.js';
import type { DocumentFile } from '../model/index.js';
import { threadAnchors } from './stored-elements.js';
import { decideStoredSuggestions } from './stored-suggestions.js';
import { storedDocumentText } from './stored-text.js';

const schema = documentSchema;

const paragraphs = (file: DocumentFile) => storedDocumentText(file, schema).split('\n').slice(2, 4);

describe('decideStoredSuggestions', () => {
  it('DOCE-FORMAT-9.8 accepts every suggestion in a stored document', () => {
    expect(typeof document).toBe('undefined');
    const file = readRegressionDocument('comments-and-suggestions');
    const {
      file: accepted,
      decided,
      dependents,
    } = decideStoredSuggestions(file, {
      schema,
      decision: 'accept',
    });
    expect(decided).toEqual(['thread-03', 'thread-04', 'thread-06', 'thread-07']);
    expect(dependents).toEqual([]);
    expect(accepted.template).toEqual(file.template);
    expect(paragraphs(accepted)).toEqual(['Text with an insertion and .', 'Overlapping comment.']);
    expect(threadAnchors(accepted).map((anchor) => anchor.thread)).toEqual([
      'thread-01',
      'thread-02',
      'thread-05',
    ]);
  });

  it('DOCE-FORMAT-9.8 rejects only the suggestions it is given', () => {
    const file = readRegressionDocument('comments-and-suggestions');
    const { file: rejected, decided } = decideStoredSuggestions(file, {
      schema,
      decision: 'reject',
      ids: ['thread-03'],
    });
    expect(decided).toEqual(['thread-03']);
    expect(paragraphs(rejected)).toEqual(['Text with  and .', 'Overlapping comment.']);
    expect(threadAnchors(rejected).map((anchor) => anchor.thread)).toContain('thread-04');
  });

  it('DOCE-FORMAT-9.8 gives the document back as it was when nothing is decided', () => {
    const file = readRegressionDocument('minimal-paragraph');
    expect(decideStoredSuggestions(file, { schema, decision: 'accept' })).toEqual({
      file,
      decided: [],
      dependents: [],
    });
  });

  it('DOCE-FORMAT-9.8 credits accepted text to the thread author when it records none', () => {
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
                { type: 'text', text: 'Wind ' },
                {
                  type: 'text',
                  text: 'speed',
                  marks: [{ type: 'insertion', attrs: { thread: 't1' } }],
                },
              ],
            },
          ],
        },
      ],
    };
    const { file: accepted } = decideStoredSuggestions(file, {
      schema,
      decision: 'accept',
      threadAuthor: () => 'writer-1',
    });
    expect(accepted.sections[0]?.content[0]?.content?.[1]).toEqual({
      type: 'text',
      text: 'speed',
      marks: [{ type: 'contributor', attrs: { author: 'writer-1' } }],
    });
  });
});
