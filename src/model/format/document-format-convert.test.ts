import { describe, expect, it } from 'vitest';
import { documentSchema, findNode } from '../../../test/document-markup.js';
import {
  type DocumentFile,
  readDocumentFile,
  type StoredNode,
  writeDocumentFile,
} from '../index.js';

const POSTER: StoredNode = { type: 'poster', attrs: { size: 'A1' }, content: [] };
const BADGE: StoredNode = { type: 'badge', attrs: { tone: 'info' } };

// One problem of each kind: an unknown block, an unknown inline node, an unknown attribute, an
// unknown mark, and a list item where its parent allows none.
const FILE: DocumentFile = {
  formatVersion: 1,
  template: null,
  sections: [
    {
      name: 'body',
      content: [
        {
          type: 'paragraph',
          attrs: { id: '0000000a', size: 3 },
          content: [
            { type: 'text', text: 'Plain ', marks: [{ type: 'glow' }] },
            BADGE,
            { type: 'text', text: ' end' },
          ],
        },
        POSTER,
        { type: 'listItem', content: [{ type: 'paragraph' }] },
      ],
    },
  ],
};

describe('lenient reading', () => {
  it('DOCE-FORMAT-1.5 throws at the first problem by default', () => {
    expect(() => readDocumentFile(FILE, documentSchema)).toThrow(
      'sections[0].content[0]: unknown attribute size',
    );
  });

  it('DOCE-FORMAT-1.5 drops what it cannot read and lists each problem', () => {
    const { doc, problems } = readDocumentFile(FILE, documentSchema, { unknown: 'drop' });
    expect(problems).toEqual([
      { path: 'sections[0].content[0]', message: 'unknown attribute size', kept: false },
      {
        path: 'sections[0].content[0].content[0].marks[0]',
        message: 'unknown mark glow',
        kept: false,
      },
      { path: 'sections[0].content[0].content[1]', message: 'unknown node badge', kept: false },
      { path: 'sections[0].content[1]', message: 'unknown node poster', kept: false },
      {
        path: 'sections[0].content[2]',
        message: 'page_content does not allow list_item',
        kept: false,
      },
    ]);
    expect(findNode(doc, 'paragraph')?.textContent).toBe('Plain  end');
    expect(writeDocumentFile(doc).sections[0]?.content).toEqual([
      {
        type: 'paragraph',
        attrs: { id: '0000000a' },
        content: [{ type: 'text', text: 'Plain  end' }],
      },
    ]);
  });

  it('DOCE-FORMAT-1.5 keeps unknown nodes whole and writes them back unchanged', () => {
    const { doc, problems } = readDocumentFile(FILE, documentSchema, { unknown: 'keep' });
    expect(problems.filter((problem) => problem.kept).map((problem) => problem.message)).toEqual([
      'unknown node badge',
      'unknown node poster',
    ]);
    expect(findNode(doc, 'kept_inline')?.attrs.stored).toEqual(BADGE);
    expect(findNode(doc, 'kept_block')?.attrs.stored).toEqual(POSTER);
    expect(writeDocumentFile(doc).sections[0]?.content).toEqual([
      {
        type: 'paragraph',
        attrs: { id: '0000000a' },
        content: [{ type: 'text', text: 'Plain ' }, BADGE, { type: 'text', text: ' end' }],
      },
      POSTER,
    ]);
  });

  it('DOCE-FORMAT-1.5 keeps a known node whose content its type does not allow', () => {
    const table: StoredNode = { type: 'table', content: [{ type: 'paragraph' }] };
    const file: DocumentFile = { formatVersion: 1, sections: [{ content: [table] }] };
    const { doc, problems } = readDocumentFile(file, documentSchema, { unknown: 'keep' });
    expect(problems.at(-1)).toEqual({
      path: 'sections[0].content[0]',
      message: 'table cannot be read',
      kept: true,
    });
    expect(writeDocumentFile(doc).sections[0]?.content).toEqual([table]);
  });

  it('DOCE-FORMAT-1.5 drops a mark it cannot read from a node that is not text', () => {
    const mention = (marks: StoredNode['marks']): DocumentFile => ({
      formatVersion: 1,
      sections: [{ content: [{ type: 'paragraph', content: [{ type: 'mention', marks }] }] }],
    });
    const marks = [{ type: 'glow' }, { type: 'bold' }];
    expect(() => readDocumentFile(mention(marks), documentSchema)).toThrow(
      'sections[0].content[0].content[0].marks[0]: unknown mark glow',
    );
    const { doc, problems } = readDocumentFile(mention(marks), documentSchema, { unknown: 'drop' });
    expect(problems.map((problem) => problem.message)).toEqual(['unknown mark glow']);
    expect(writeDocumentFile(doc).sections[0]?.content[0]?.content).toEqual([
      { type: 'mention', marks: [{ type: 'bold' }] },
    ]);
  });

  it('DOCE-FORMAT-1.5 still refuses a file that is not a stored document', () => {
    expect(() =>
      readDocumentFile({ formatVersion: 2, sections: [] }, documentSchema, { unknown: 'keep' }),
    ).toThrow('formatVersion: must be 1');
  });
});

describe('mark order on reading', () => {
  it('DOCE-FORMAT-1.2 reads overlapping marks of one type in canonical order', () => {
    const comment = (thread: string) => ({ type: 'comment', attrs: { thread } });
    const file: DocumentFile = {
      formatVersion: 1,
      sections: [
        {
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Shared', marks: [comment('t2'), comment('t1')] }],
            },
          ],
        },
      ],
    };
    const { doc } = readDocumentFile(file, documentSchema);
    const written = writeDocumentFile(doc).sections[0]?.content[0]?.content?.[0];
    expect(written?.marks).toEqual([comment('t1'), comment('t2')]);
  });
});
