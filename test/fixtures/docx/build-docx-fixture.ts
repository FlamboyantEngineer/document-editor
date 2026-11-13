// Builds generic word processing documents for the import tests and the export-then-import test:
// the XML parts a test gives, wrapped in the package parts every document has, zipped with each
// part deflated, as word processors write them. Only Node may run it (it deflates with `node:zlib`).

import { deflateRawSync } from 'node:zlib';
import { crc32 } from '../../../src/model/format/zip.js';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NAMESPACES = [
  `xmlns:w="${W}"`,
  `xmlns:r="${R}"`,
  'xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"',
  'xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml"',
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"',
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"',
  'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"',
  'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"',
  'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"',
].join(' ');
const HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

/** The parts of a fixture document; each XML part is given without its root element. */
export interface DocxFixture {
  /** The body's content, its last section's properties included. */
  readonly body: string;
  readonly styles?: string;
  readonly numbering?: string;
  readonly footnotes?: string;
  readonly endnotes?: string;
  readonly comments?: string;
  readonly commentsExtended?: string;
  readonly settings?: string;
  /** Header and footer parts by name (`header1`, `footer1`), each a `w:hdr` or `w:ftr`'s content. */
  readonly regions?: Readonly<Record<string, string>>;
  /** Images by their name in `word/media/`, each related as `rId<name without extension>`. */
  readonly media?: Readonly<Record<string, Uint8Array>>;
  /** Outside links, each related by its id. */
  readonly links?: Readonly<Record<string, string>>;
  /** Whether parts are stored without compression; deflated by default. */
  readonly stored?: boolean;
}

const PARTS: readonly (readonly [keyof DocxFixture, string, string])[] = [
  ['styles', 'styles', 'w:styles'],
  ['numbering', 'numbering', 'w:numbering'],
  ['footnotes', 'footnotes', 'w:footnotes'],
  ['endnotes', 'endnotes', 'w:endnotes'],
  ['comments', 'comments', 'w:comments'],
  ['commentsExtended', 'commentsExtended', 'w15:commentsEx'],
  ['settings', 'settings', 'w:settings'],
];

const relationship = (id: string, type: string, target: string, external = false) =>
  `<Relationship Id="${id}" Type="${type.startsWith('http') ? type : `${R}/${type}`}" Target="${target}"${external ? ' TargetMode="External"' : ''}/>`;

function zip(files: readonly { path: string; data: Uint8Array }[], stored: boolean): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.path);
    const data = stored ? file.data : deflateRawSync(file.data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x0800, 6);
    header.writeUInt16LE(stored ? 0 : 8, 8);
    header.writeUInt32LE(crc32(file.data), 14);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(file.data.length, 22);
    header.writeUInt16LE(name.length, 26);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt16LE(stored ? 0 : 8, 10);
    entry.writeUInt32LE(crc32(file.data), 16);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(file.data.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(offset, 42);
    chunks.push(header, Buffer.from(name), Buffer.from(data));
    central.push(entry, Buffer.from(name));
    offset += 30 + name.length + data.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...chunks, directory, end]));
}

/** A fixture's parts as the bytes of a `.docx`. */
export function buildDocx(fixture: DocxFixture): Uint8Array {
  const encoder = new TextEncoder();
  const files: { path: string; data: Uint8Array }[] = [];
  const add = (path: string, text: string) => files.push({ path, data: encoder.encode(text) });
  const relationships: string[] = [];
  add(
    '[Content_Types].xml',
    `${HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/></Types>`,
  );
  add(
    '_rels/.rels',
    `${HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationship('rId1', 'officeDocument', 'word/document.xml')}</Relationships>`,
  );
  add(
    'word/document.xml',
    `${HEADER}<w:document ${NAMESPACES}><w:body>${fixture.body}</w:body></w:document>`,
  );
  for (const [key, name, root] of PARTS) {
    const content = fixture[key];
    if (typeof content !== 'string') continue;
    add(`word/${name}.xml`, `${HEADER}<${root} ${NAMESPACES}>${content}</${root}>`);
    const type =
      key === 'commentsExtended'
        ? 'http://schemas.microsoft.com/office/2011/relationships/commentsExtended'
        : name;
    relationships.push(relationship(`rId${name}`, type, `${name}.xml`));
  }
  for (const [name, content] of Object.entries(fixture.regions ?? {})) {
    const root = name.startsWith('header') ? 'w:hdr' : 'w:ftr';
    add(`word/${name}.xml`, `${HEADER}<${root} ${NAMESPACES}>${content}</${root}>`);
    relationships.push(relationship(`rId${name}`, name.replace(/\d+$/, ''), `${name}.xml`));
  }
  for (const [name, data] of Object.entries(fixture.media ?? {})) {
    files.push({ path: `word/media/${name}`, data });
    relationships.push(relationship(`rId${name.replace(/\.\w+$/, '')}`, 'image', `media/${name}`));
  }
  for (const [id, href] of Object.entries(fixture.links ?? {})) {
    relationships.push(relationship(id, 'hyperlink', href, true));
  }
  add(
    'word/_rels/document.xml.rels',
    `${HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships.join('')}</Relationships>`,
  );
  return zip(files, fixture.stored === true);
}

/** A paragraph: its properties' content (such as a style) and its runs. */
export const paragraph = (runs: string, properties = '') =>
  `<w:p>${properties ? `<w:pPr>${properties}</w:pPr>` : ''}${runs}</w:p>`;

/** A run of text with its properties' content (such as `<w:b/>`). */
export const run = (text: string, properties = '') =>
  `<w:r>${properties ? `<w:rPr>${properties}</w:rPr>` : ''}<w:t xml:space="preserve">${text}</w:t></w:r>`;

/** A paragraph style reference. */
export const style = (id: string) => `<w:pStyle w:val="${id}"/>`;

/** Section properties: a page size in twentieths of a point, landscape when wider than tall. */
export const section = (width: number, height: number, extra = '') =>
  `<w:sectPr>${extra}<w:pgSz w:w="${String(width)}" w:h="${String(height)}"${width > height ? ' w:orient="landscape"' : ''}/><w:pgMar w:top="1440" w:right="1134" w:bottom="1440" w:left="1134" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>`;

/** An A4 portrait page's section properties. */
export const A4 = section(11906, 16838);
