// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { documentSchema as schema } from '../../test/document-markup.js';
import { readRegressionDocument } from '../../test/stored-fixtures.js';
import type { DocumentFile, StoredNode } from '../model/index.js';
import { authoredContent } from './authored-content.js';
import { updateStoredThreads } from './stored-threads.js';

const text = (value: string, marks?: StoredNode['marks']): StoredNode =>
  marks ? { type: 'text', text: value, marks } : { type: 'text', text: value };

const paragraph = (id: string, content: StoredNode[], attrs = {}): StoredNode => ({
  type: 'paragraph',
  attrs: { id, ...attrs },
  content,
});

const heading = (id: string, level: number, title: string): StoredNode => ({
  type: 'heading',
  attrs: { id, level },
  content: [text(title)],
});

const fileOf = (...content: StoredNode[]): DocumentFile => ({
  formatVersion: 1,
  sections: [{ name: 'body', content }],
});

describe('authoredContent', () => {
  it('DOCE-FORMAT-9.12 is the same when only discussion and authorship change', () => {
    expect(typeof document).toBe('undefined');
    const plain = fileOf(paragraph('a0000001', [text('A commented phrase.')]));
    const discussed = fileOf(
      paragraph(
        'a0000001',
        [
          text('A '),
          text('commented', [{ type: 'comment', attrs: { thread: 't-1', state: 'resolved' } }]),
          text(' phrase.', [{ type: 'contributor', attrs: { author: 'person-01' } }]),
        ],
        { author: 'person-01', aiSession: 'session-01' },
      ),
    );
    expect(authoredContent(discussed)).toEqual(authoredContent(plain));
    expect(authoredContent(plain).content).not.toBe(
      authoredContent(fileOf(paragraph('a0000001', [text('Another phrase.')]))).content,
    );
  });

  it('DOCE-FORMAT-9.12 keeps suggestions as content but not the thread discussing them', () => {
    const suggest = (thread: string) =>
      fileOf(paragraph('a0000001', [text('Added', [{ type: 'insertion', attrs: { thread } }])]));
    expect(authoredContent(suggest('t-1'))).toEqual(authoredContent(suggest('t-2')));
    expect(authoredContent(suggest('t-1'))).not.toEqual(
      authoredContent(fileOf(paragraph('a0000001', [text('Added')]))),
    );
  });

  it('DOCE-FORMAT-9.12 is unchanged by resolving a thread in a regression document', () => {
    const file = readRegressionDocument('comments-and-suggestions');
    const { file: resolved } = updateStoredThreads(file, {
      schema,
      changes: { 'thread-01': 'resolved' },
    });
    expect(authoredContent(resolved).content).toBe(authoredContent(file).content);
  });

  it('DOCE-FORMAT-9.12 reads the spans of the given headings and names those not found', () => {
    const file = fileOf(
      heading('a0000001', 1, 'One'),
      paragraph('a0000002', [text('In one.')]),
      heading('a0000003', 2, 'One point one'),
      paragraph('a0000004', [text('Still in one.')]),
      heading('a0000005', 1, 'Two'),
      paragraph('a0000006', [text('In two.')]),
    );
    const one = authoredContent(file, { headings: ['a0000001', 'ffffffff'] });
    expect(one.missing).toEqual(['ffffffff']);
    expect(one.content).toContain('Still in one.');
    expect(one.content).not.toContain('In two.');
    const changedTwo = fileOf(
      ...(file.sections[0]?.content.slice(0, 5) ?? []),
      paragraph('a0000006', [text('Changed.')]),
    );
    expect(authoredContent(changedTwo, { headings: ['a0000001'] }).content).toBe(one.content);
  });

  it('DOCE-FORMAT-9.12 leaves out the attributes and script output it is told to', () => {
    const script = (output: string, state: string): DocumentFile =>
      fileOf(paragraph('a0000001', [text('Body.')], { state }), {
        type: 'script',
        attrs: { id: 'a0000002', source: 'signatures()', renderedAt: output },
        content: [paragraph('a0000003', [text(output)])],
      });
    const options = {
      attrs: ['state'],
      leaveOutput: (source: string) => source === 'signatures()',
    };
    expect(authoredContent(script('Signed by one.', 'draft'), options)).toEqual(
      authoredContent(script('Signed by two.', 'approved'), options),
    );
    expect(authoredContent(script('Signed by one.', 'draft')).content).not.toBe(
      authoredContent(script('Signed by two.', 'draft')).content,
    );
  });
});
