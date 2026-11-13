// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readRegressionDocument } from '../../test/stored-fixtures.js';
import type { DocumentFile } from '../model/index.js';
import { findStoredElement, storedCitations, threadAnchors } from './stored-elements.js';

const text = (value: string, marks?: { type: string; attrs?: Record<string, unknown> }[]) =>
  marks ? { type: 'text', text: value, marks } : { type: 'text', text: value };

describe('stored-file readers on the stored JSON', () => {
  it('DOCE-FORMAT-9.1 finds an element by its id, with its path and the element holding it', () => {
    expect(typeof document).toBe('undefined');
    const file = readRegressionDocument('cross-references');
    const cell = findStoredElement(file, 'c52657e3');
    expect(cell?.node.type).toBe('paragraph');
    expect(cell?.path).toBe('sections[0].content[2].content[0].content[0].content[0]');
    expect(cell?.parentId).toBe('ca265fc2');
    expect(cell?.section.name).toBe('body');
    expect(findStoredElement(file, 'c7265b09')?.parentId).toBeNull();
    expect(findStoredElement(file, 'ffffffff')).toBeNull();
  });

  it('DOCE-FORMAT-9.1 finds a footnote by its element id, not its footnote id', () => {
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
                text('Gauge'),
                {
                  type: 'footnote',
                  attrs: { id: 'note-1', elementId: 'a0000002' },
                  content: [text('Read at noon.')],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(findStoredElement(file, 'a0000002')).toMatchObject({
      path: 'sections[0].content[0].content[1]',
      parentId: 'a0000001',
    });
    expect(findStoredElement(file, 'note-1')).toBeNull();
  });

  it('DOCE-FORMAT-9.3 lists citations with their targets, kinds and citing text', () => {
    const citations = storedCitations(readRegressionDocument('cross-references'));
    expect(
      citations.map(({ target, referenceType, broken, text: cited }) => [
        target,
        referenceType,
        broken,
        cited,
      ]),
    ).toEqual([
      ['c7265b09', 'internal-heading', false, 'the heading'],
      ['c4265650', 'internal-figure', false, 'the figure'],
      ['c8265c9c', 'internal-table', false, 'the table'],
      ['c9265e2f', 'internal-codeblock', false, 'the code'],
      ['ce26660e', 'internal-equation', false, 'the equation'],
      ['deadbeef', 'internal-heading', true, 'missing'],
    ]);
    expect(citations[0]).toMatchObject({
      path: 'sections[0].content[5].content[1]',
      parentId: 'cf2667a1',
      attrs: { target: 'c7265b09' },
    });
  });

  it('DOCE-FORMAT-9.3 joins a citation that formatting parts, and cites in footnotes', () => {
    const reference = { type: 'reference', attrs: { referenceType: 'catalogue', target: 'x-1' } };
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
                text('See '),
                text('the '),
                text('station', [{ type: 'bold' }, reference]),
                text(' log', [reference]),
                {
                  type: 'footnote',
                  attrs: { id: 'n1', elementId: 'a0000002' },
                  content: [text('the log', [reference])],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(storedCitations(file).map(({ text: cited, parentId }) => [cited, parentId])).toEqual([
      ['station log', 'a0000001'],
      ['the log', 'a0000002'],
    ]);
  });

  it('DOCE-FORMAT-9.6 gives each thread its state, marks, quoted text and elements', () => {
    expect(threadAnchors(readRegressionDocument('comments-and-suggestions'))).toEqual([
      {
        thread: 'thread-01',
        state: 'open',
        marks: ['comment'],
        text: 'commented phrase',
        elementIds: ['d74deeab'],
      },
      {
        thread: 'thread-02',
        state: 'resolved',
        marks: ['comment'],
        text: 'resolved one',
        elementIds: ['d74deeab'],
      },
      {
        thread: 'thread-03',
        state: 'open',
        marks: ['insertion'],
        text: 'an insertion',
        elementIds: ['d64ded18'],
      },
      {
        thread: 'thread-04',
        state: 'open',
        marks: ['deletion'],
        text: 'a deletion',
        elementIds: ['d64ded18'],
      },
      {
        thread: 'thread-05',
        state: 'open',
        marks: ['comment'],
        text: 'Overlapping comment',
        elementIds: ['dd4df81d'],
      },
      {
        thread: 'thread-06',
        state: 'open',
        marks: ['insertion'],
        text: 'Overlapping',
        elementIds: ['dd4df81d'],
      },
      {
        thread: 'thread-07',
        state: 'open',
        marks: ['insertion'],
        text: 'A paragraph split by a suggestion.',
        elementIds: ['dc4df68a'],
      },
    ]);
  });

  it('DOCE-FORMAT-9.6 quotes a thread over several blocks once per run', () => {
    const comment = { type: 'comment', attrs: { thread: 't1' } };
    const insertion = { type: 'insertion', attrs: { thread: 't1' } };
    const paragraph = (id: string, ...content: ReturnType<typeof text>[]) => ({
      type: 'paragraph',
      attrs: { id },
      content,
    });
    const file: DocumentFile = {
      formatVersion: 1,
      sections: [
        {
          name: null,
          content: [
            paragraph('a0000001', text('Dry '), text('season', [comment, insertion])),
            paragraph('a0000002', text('rain', [comment]), text(' gauge')),
          ],
        },
      ],
    };
    expect(threadAnchors(file)).toEqual([
      {
        thread: 't1',
        state: 'open',
        marks: ['comment', 'insertion'],
        text: 'season rain',
        elementIds: ['a0000001', 'a0000002'],
      },
    ]);
  });
});
