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
      'word/footnotes.xml',
      'word/_rels/document.xml.rels',
    ]);
    const document = files.get('word/document.xml') ?? '';
    expect(document).toContain(
      '<w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t xml:space="preserve">Power</w:t>',
    );
    expect(document).toContain('<w:rPr><w:b/></w:rPr><w:t xml:space="preserve">must</w:t>');
    expect(document).not.toContain('old');
    expect(document).toContain('<w:hyperlink r:id="rIdLink1">');
    expect(document).toContain('<w:footnoteReference w:id="1"/>');
    expect(document).toContain('•\t');
    expect(document).toContain('<w:pStyle w:val="TableHeader"/>');
    expect(document).toContain('<w:br w:type="page"/>');
    expect(document).toContain('w:orient="landscape"');
    expect(files.get('word/footnotes.xml')).toContain('At the connector.');
    expect(files.get('word/_rels/document.xml.rels')).toContain(
      'Target="https://example.com/spec"',
    );
  });
});
