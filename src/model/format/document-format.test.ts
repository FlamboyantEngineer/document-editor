import { Fragment, type Node } from 'prosemirror-model';
import { describe, expect, it } from 'vitest';
import { documentSchema, findNode } from '../../../test/document-markup.js';
import {
  type DocumentFile,
  isDocumentFormatError,
  readDocumentFile,
  writeDocumentFile,
} from '../index.js';

const FILE: DocumentFile = {
  formatVersion: 1,
  template: 'report',
  sections: [
    {
      name: 'introduction',
      content: [
        {
          type: 'heading',
          attrs: { level: 2, id: 'h1', author: 'u1' },
          content: [{ type: 'text', text: 'Scope' }],
        },
        {
          type: 'paragraph',
          attrs: { id: 'p1', level: 2, style: 'lead' },
          content: [
            { type: 'text', text: 'Bold', marks: [{ type: 'bold' }] },
            { type: 'text', text: ' and cited' },
            {
              type: 'footnote',
              attrs: { id: 'fn1' },
              content: [{ type: 'text', text: 'A note.', marks: [{ type: 'italic' }] }],
            },
            { type: 'math', attrs: { source: 'x^2' } },
            { type: 'variable', attrs: { key: 'document.name' } },
          ],
        },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'One' }] }],
            },
          ],
        },
      ],
    },
    { name: null, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Free' }] }] },
  ],
};

describe('stored document format', () => {
  it('DOCE-FORMAT-1.1 reads a stored document and writes it back unchanged', () => {
    const doc = readDocumentFile(FILE, documentSchema);
    expect(writeDocumentFile(doc, { template: 'report' })).toEqual(FILE);
  });

  it('DOCE-FORMAT-1.2 lays each stored section out on one page for the editor', () => {
    const doc = readDocumentFile(FILE, documentSchema);
    const section = doc.firstChild;
    expect(section?.type.name).toBe('page_section');
    expect(section?.attrs.sectionName).toBe('introduction');
    expect(section?.firstChild?.content.content.map((node) => node.type.name)).toEqual([
      'page_header',
      'page_content',
      'page_footnotes',
      'page_footer',
    ]);
    expect(findNode(doc, 'paragraph')?.attrs).toMatchObject({
      dataId: 'p1',
      paragraphLevel: 2,
      className: 'lead',
    });
    expect(findNode(doc, 'footnote_entry')?.textContent).toBe('A note.');
    expect(findNode(doc, 'math_inline')?.textContent).toBe('x^2');
  });

  it('DOCE-FORMAT-1.3 stores content only, without layout attributes or rendered text', () => {
    const { nodes } = documentSchema;
    const create = (name: string, attrs: Record<string, unknown> | null, content?: Node[]) => {
      const type = nodes[name];
      if (!type) throw new Error(name);
      return type.create(attrs, content);
    };
    const paragraph = create('paragraph', { dataId: 'p1', splitPartIndex: 1 }, [
      documentSchema.text('Text'),
    ]);
    const page = create('page', null, [
      create('page_header', { html: '<p>Header</p>', pageNumber: 3 }),
      create('page_content', null, [paragraph]),
      create('page_footnotes', null),
      create('page_footer', null),
    ]);
    const doc = create('doc', null, [
      create('page_section', { sectionName: 'body', sectionCssVars: '--x: 1' }, [page]),
    ]);
    expect(writeDocumentFile(doc).sections).toEqual([
      {
        name: 'body',
        content: [
          { type: 'paragraph', attrs: { id: 'p1' }, content: [{ type: 'text', text: 'Text' }] },
        ],
      },
    ]);
  });

  it('DOCE-FORMAT-1.3 stores a block split across pages as one whole block', () => {
    const doc = readDocumentFile(FILE, documentSchema);
    const section = doc.child(0);
    const page = section.child(0);
    const [header, , footnotes, footer] = page.content.content;
    const part = (index: number, text: string) =>
      documentSchema.node('paragraph', { dataId: 'p9', splitPartIndex: index }, [
        documentSchema.text(text),
      ]);
    const onPage = (block: Node) =>
      page.copy(
        Fragment.from([
          header,
          documentSchema.node('page_content', null, [block]),
          footnotes,
          footer,
        ] as Node[]),
      );
    const split = doc.copy(
      Fragment.from(section.copy(Fragment.from([onPage(part(0, 'Run ')), onPage(part(1, 'on'))]))),
    );
    expect(writeDocumentFile(split).sections[0]?.content).toEqual([
      { type: 'paragraph', attrs: { id: 'p9' }, content: [{ type: 'text', text: 'Run on' }] },
    ]);
  });

  it('DOCE-FORMAT-1.4 names where a stored document cannot be read', () => {
    const read = (file: unknown) => () => readDocumentFile(file, documentSchema);
    expect(read({ ...FILE, formatVersion: 2 })).toThrow('formatVersion: must be 1');
    let failure: unknown;
    try {
      read({ formatVersion: 1, sections: [{ content: [{ type: 'poster' }] }] })();
    } catch (error) {
      failure = error;
    }
    expect(isDocumentFormatError(failure) && failure.path).toBe('sections[0].content[0]');
    expect(
      read({
        formatVersion: 1,
        sections: [{ content: [{ type: 'paragraph', attrs: { size: 3 } }] }],
      }),
    ).toThrow('sections[0].content[0]: unknown attribute size');
    expect(read({ formatVersion: 1, sections: [{ content: [{ type: 'listItem' }] }] })).toThrow(
      'sections[0].content[0]',
    );
  });
});
