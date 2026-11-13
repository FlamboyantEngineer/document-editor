import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import type { DocumentFile, StoredNode } from './document-format.js';
import { readDocumentFile } from './document-format-convert.js';
import { writeDocumentFile } from './document-format-write.js';
import { writeDocx } from './docx.js';
import { crc32, writeZip } from './zip.js';

const text = (value: string, ...marks: string[]): StoredNode => ({
  type: 'text',
  text: value,
  ...(marks.length ? { marks: marks.map((type) => ({ type })) } : {}),
});

// The files of a stored archive, read back from its local headers.
function readStored(bytes: Uint8Array): Map<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  const files = new Map<string, string>();
  let at = 0;
  while (view.getUint32(at, true) === 0x04034b50) {
    const crc = view.getUint32(at + 14, true);
    const size = view.getUint32(at + 18, true);
    const nameLength = view.getUint16(at + 26, true);
    const name = decoder.decode(bytes.subarray(at + 30, at + 30 + nameLength));
    const data = bytes.subarray(at + 30 + nameLength, at + 30 + nameLength + size);
    expect(crc32(data)).toBe(crc);
    files.set(name, decoder.decode(data));
    at += 30 + nameLength + size;
  }
  return files;
}

describe('writeZip', () => {
  it('DOCE-FORMAT-5.1 stores files with their checksums and a central directory', () => {
    expect(crc32(new TextEncoder().encode('The quick brown fox jumps over the lazy dog'))).toBe(
      0x414fa339,
    );
    const archive = writeZip([
      { path: 'a.txt', data: 'Alpha' },
      { path: 'dir/b.txt', data: 'Beta' },
    ]);
    expect([...readStored(archive)]).toEqual([
      ['a.txt', 'Alpha'],
      ['dir/b.txt', 'Beta'],
    ]);
    const end = new DataView(archive.buffer).getUint32(archive.length - 22, true);
    expect(end).toBe(0x06054b50);
  });
});

// A document with inline and display math, as the editor stores it.
function storedMath(): DocumentFile {
  const stored: DocumentFile = {
    formatVersion: 1,
    sections: [
      {
        name: null,
        content: [
          { type: 'paragraph', content: [text('So '), { type: 'math', attrs: { source: 'a^2' } }] },
          { type: 'mathBlock', attrs: { source: 'b_1' } },
        ],
      },
    ],
  };
  return writeDocumentFile(readDocumentFile(stored, documentSchema).doc);
}

describe('writeDocx', () => {
  it('DOCE-FORMAT-5.2 writes the source of the math a stored document holds', () => {
    const document = readStored(writeDocx(storedMath())).get('word/document.xml') ?? '';
    expect(document).toContain('a^2');
    expect(document).toContain('b_1');
  });

  it('DOCE-FORMAT-5.2 writes headings, formats, lists, tables, links and footnotes', () => {
    const file: DocumentFile = {
      formatVersion: 1,
      sections: [
        {
          name: null,
          content: [
            { type: 'heading', attrs: { level: 1 }, content: [text('Power')] },
            {
              type: 'paragraph',
              content: [
                text('Supply '),
                text('must', 'bold'),
                { type: 'text', text: 'old', marks: [{ type: 'deletion' }] },
                {
                  type: 'text',
                  text: 'spec',
                  marks: [{ type: 'link', attrs: { href: 'https://example.com/spec' } }],
                },
                { type: 'footnote', attrs: { id: 'n1' }, content: [text('At the connector.')] },
              ],
            },
            {
              type: 'bulletList',
              content: [
                { type: 'listItem', content: [{ type: 'paragraph', content: [text('One')] }] },
              ],
            },
            {
              type: 'table',
              content: [
                {
                  type: 'tableRow',
                  content: [
                    {
                      type: 'tableHeader',
                      content: [{ type: 'paragraph', content: [text('Item')] }],
                    },
                  ],
                },
              ],
            },
            { type: 'pageBreak' },
          ],
        },
      ],
    };
    const files = readStored(
      writeDocx(file, {
        template: { formatVersion: 1, id: 't', page: { orientation: 'landscape' } },
      }),
    );
    expect([...files.keys()]).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'word/document.xml',
      'word/styles.xml',
      'word/numbering.xml',
      'word/settings.xml',
      'word/footnotes.xml',
      'word/_rels/document.xml.rels',
      'word/_rels/footnotes.xml.rels',
    ]);
    const document = files.get('word/document.xml') ?? '';
    expect(document).toMatch(
      /<w:pStyle w:val="Heading1"\/><w:numPr>.*?<\/w:pPr><w:r><w:t xml:space="preserve">Power<\/w:t>/,
    );
    expect(document).toContain('<w:rPr><w:b/></w:rPr><w:t xml:space="preserve">must</w:t>');
    expect(document).not.toContain('old');
    expect(document).toContain('<w:hyperlink r:id="rIdLink1">');
    expect(document).toContain('<w:footnoteReference w:id="1"/>');
    expect(document).toContain('<w:pStyle w:val="ListParagraph"/><w:numPr>');
    expect(document).toContain('<w:pStyle w:val="TableHeader"/>');
    expect(document).toContain('<w:br w:type="page"/>');
    expect(document).toContain('w:orient="landscape"');
    expect(files.get('word/footnotes.xml')).toContain('At the connector.');
    expect(files.get('word/_rels/document.xml.rels')).toContain(
      'Target="https://example.com/spec"',
    );
  });

  it('DOCE-FORMAT-5.2 gives a link in a footnote a relationship of the footnotes part', () => {
    const linked = (href: string): StoredNode => ({
      type: 'text',
      text: 'here',
      marks: [{ type: 'link', attrs: { href } }],
    });
    const note: StoredNode = {
      type: 'footnote',
      attrs: { id: 'n1' },
      content: [text('See '), linked('https://example.com/note')],
    };
    const files = readStored(
      writeDocx({
        formatVersion: 1,
        sections: [
          {
            name: null,
            content: [{ type: 'paragraph', content: [linked('https://example.com/body'), note] }],
          },
        ],
      }),
    );
    // Each part names its links by its own relationships.
    expect(files.get('word/footnotes.xml')).toContain('<w:hyperlink r:id="rIdLink1">');
    const ofNotes = files.get('word/_rels/footnotes.xml.rels') ?? '';
    expect(ofNotes).toContain('Id="rIdLink1"');
    expect(ofNotes).toContain('Target="https://example.com/note"');
    const ofDocument = files.get('word/_rels/document.xml.rels') ?? '';
    expect(ofDocument).toContain('Target="https://example.com/body"');
    expect(ofDocument).not.toContain('https://example.com/note');
  });

  it('DOCE-FORMAT-5.2 leaves out the characters XML cannot hold', () => {
    const files = readStored(
      writeDocx({
        formatVersion: 1,
        sections: [
          {
            name: null,
            content: [
              { type: 'paragraph', content: [text('A\u000bB\u0001C\tD\uffffE')] },
              { type: 'codeBlock', content: [text('x\u000c\ny')] },
            ],
          },
        ],
      }),
    );
    const document = files.get('word/document.xml') ?? '';
    expect(document).toContain('<w:t xml:space="preserve">ABC\tDE</w:t>');
    expect(document).not.toMatch(/[^\P{Cc}\t\n\r]|\uffff/u);
  });

  it('DOCE-FORMAT-5.2 writes a link whose address could run script as its text', () => {
    const linked: StoredNode = {
      type: 'text',
      text: 'site',
      marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
    };
    const files = readStored(
      writeDocx({
        formatVersion: 1,
        sections: [{ name: null, content: [{ type: 'paragraph', content: [linked] }] }],
      }),
    );
    expect(files.get('word/document.xml')).toContain('<w:t xml:space="preserve">site</w:t>');
    expect(files.get('word/document.xml')).not.toContain('<w:hyperlink');
    expect(files.get('word/_rels/document.xml.rels')).not.toContain('javascript');
  });

  it('DOCE-FORMAT-5.3 leaves out suggested blocks and writes variables with their values', () => {
    const file: DocumentFile = {
      formatVersion: 1,
      sections: [
        {
          name: null,
          content: [
            { type: 'figure', attrs: { alt: 'Pond', suggestionKind: 'insertion' } },
            {
              type: 'paragraph',
              attrs: { suggestionKind: 'deletion' },
              content: [text('Gone paragraph', 'deletion')],
            },
            {
              type: 'paragraph',
              content: [text('Title: '), { type: 'variable', attrs: { key: 'document.title' } }],
            },
          ],
        },
      ],
    };
    const values = { variable: (key: string) => (key === 'document.title' ? 'Field notes' : null) };
    const accepted = readStored(writeDocx(file, { values })).get('word/document.xml') ?? '';
    expect(accepted).toContain('[Pond]');
    expect(accepted).not.toContain('Gone paragraph');
    expect(accepted).toContain('>Field notes</w:t>');
    const rejected =
      readStored(writeDocx(file, { suggestions: 'rejected' })).get('word/document.xml') ?? '';
    expect(rejected).not.toContain('[Pond]');
    expect(rejected).toContain('Gone paragraph');
    expect(rejected).toContain('>{{document.title}}</w:t>');
  });

  it('DOCE-FORMAT-5.5 leaves an unnumbered heading without a number', () => {
    const files = readStored(
      writeDocx({
        formatVersion: 1,
        sections: [
          {
            name: null,
            content: [
              { type: 'heading', attrs: { numbered: false }, content: [text('Preface')] },
              { type: 'heading', content: [text('Start')] },
            ],
          },
        ],
      }),
    );
    const document = files.get('word/document.xml') ?? '';
    expect(document).toContain(
      '<w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t xml:space="preserve">Preface',
    );
    expect(document).toMatch(/<w:pStyle w:val="Heading1"\/><w:numPr>.*?Start/);
  });
});
