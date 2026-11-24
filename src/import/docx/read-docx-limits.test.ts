// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildDocx, paragraph, run } from '../../../test/fixtures/docx/build-docx-fixture.js';
import { writeZip } from '../../model/format/zip.js';
import { readDocx } from './read-docx.js';

const RELS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const OFFICE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const WORD = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

// The parts of a plain package, with optional additions or replacements.
function packageParts(files: Record<string, string>, main = 'word/document.xml') {
  return Object.entries({
    '[Content_Types].xml':
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>',
    '_rels/.rels': `<Relationships xmlns="${RELS}"><Relationship Id="rId1" Type="${OFFICE}/officeDocument" Target="${main}"/></Relationships>`,
    [main]: `<w:document xmlns:w="${WORD}"><w:body><w:p><w:r><w:t>Hi</w:t></w:r></w:p></w:body></w:document>`,
    ...files,
  }).map(([path, data]) => ({ path, data }));
}

const pack = (files: Record<string, string>, main?: string) => writeZip(packageParts(files, main));

describe('limits and refusals of the word processing reader', () => {
  it('DOCE-IMPORT-2.14 refuses documents with macros, by part, content type or relationship', async () => {
    const refused = { ok: false, failure: 'refused' };
    await expect(readDocx(pack({ 'word/vbaProject.bin': 'x' }))).resolves.toMatchObject(refused);
    await expect(
      readDocx(
        pack({
          'word/renamed.bin': 'x',
          '[Content_Types].xml':
            '<Types><Override PartName="/word/document.xml" ContentType="application/vnd.ms-word.document.macroEnabled.main+xml"/></Types>',
        }),
      ),
    ).resolves.toMatchObject(refused);
    await expect(
      readDocx(
        pack({
          'word/_rels/document.xml.rels': `<Relationships xmlns="${RELS}"><Relationship Id="rId9" Type="http://schemas.microsoft.com/office/2006/relationships/vbaProject" Target="code.bin"/></Relationships>`,
        }),
      ),
    ).resolves.toMatchObject(refused);
    await expect(readDocx(pack({}))).resolves.toMatchObject({ ok: true });
  });

  it('DOCE-IMPORT-2.14 refuses main parts that are not where Word puts them', async () => {
    await expect(readDocx(pack({}, 'other/main.xml'))).resolves.toMatchObject({
      ok: false,
      failure: 'refused',
    });
    await expect(
      readDocx(
        pack({
          'word/_rels/document.xml.rels': `<Relationships xmlns="${RELS}"><Relationship Id="rId2" Type="${OFFICE}/styles" Target="../elsewhere/styles.xml"/></Relationships>`,
          'elsewhere/styles.xml': '<w:styles xmlns:w="w"/>',
        }),
      ),
    ).resolves.toMatchObject({ ok: false, failure: 'refused' });
  });

  it('DOCE-IMPORT-2.14 refuses XML entity declarations', async () => {
    const result = await readDocx(
      pack({
        'word/_rels/document.xml.rels': `<?xml version="1.0"?><!DOCTYPE r [<!ENTITY a "b">]><Relationships xmlns="${RELS}"/>`,
      }),
    );
    expect(result).toMatchObject({ ok: false, failure: 'refused' });
  });

  it('DOCE-IMPORT-2.1 limits XML parts, their nesting and the document read', async () => {
    const big = buildDocx({ body: paragraph(run('x'.repeat(5000))) });
    await expect(readDocx(big, { limits: { xmlBytes: 1000 } })).resolves.toMatchObject({
      ok: false,
      failure: 'too-large',
    });
    await expect(readDocx(big, { limits: { outputBytes: 1000 } })).resolves.toMatchObject({
      ok: false,
      failure: 'too-large',
    });
    await expect(readDocx(big, { limits: { xmlDepth: 3 } })).resolves.toMatchObject({
      ok: false,
      failure: 'too-large',
    });
    await expect(readDocx(big)).resolves.toMatchObject({ ok: true });
  });
  it('DOCE-IMPORT-2.1 counts the root and document relationships once at the exact ZIP limit', async () => {
    const parts = packageParts({ 'word/_rels/document.xml.rels': '<Relationships/>' });
    const totalBytes = parts.reduce(
      (sum, part) => sum + new TextEncoder().encode(part.data).length,
      0,
    );
    const zip = writeZip(parts);
    await expect(readDocx(zip, { limits: { totalBytes } })).resolves.toMatchObject({ ok: true });
    await expect(readDocx(zip, { limits: { totalBytes: totalBytes - 1 } })).resolves.toMatchObject({
      ok: false,
      failure: 'too-large',
    });
  });

  it('DOCE-IMPORT-2.1 applies XML depth and size limits to package metadata', async () => {
    const largeTypes = `<Types><!-- ${'x'.repeat(600)} --></Types>`;
    const nestedRelationship = `<Relationships>${'<Relationship>'.repeat(7)}<Extra/>${'</Relationship>'.repeat(7)}</Relationships>`;
    await expect(
      readDocx(pack({ '[Content_Types].xml': largeTypes }), { limits: { xmlBytes: 500 } }),
    ).resolves.toMatchObject({ ok: false, failure: 'too-large' });
    await expect(
      readDocx(pack({ 'word/_rels/unreferenced.xml.rels': nestedRelationship }), {
        limits: { xmlDepth: 6 },
      }),
    ).resolves.toMatchObject({ ok: false, failure: 'too-large' });
  });

  it('DOCE-IMPORT-2.1 reads package metadata and document content with alternate namespace prefixes', async () => {
    const document = pack({
      '[Content_Types].xml':
        '<ct:Types xmlns:ct="http://schemas.openxmlformats.org/package/2006/content-types"/>',
      '_rels/.rels': `<pkg:Relationships xmlns:pkg="${RELS}"><pkg:Relationship Id="doc" Type="${OFFICE}/officeDocument" Target="word/document.xml"/></pkg:Relationships>`,
      'word/document.xml': `<word:document xmlns:word="${WORD}"><body xmlns="${WORD}"><p><r><rPr><b word:val="1"/></rPr><t>Alternate prefixes</t></r></p></body></word:document>`,
    });
    await expect(readDocx(document)).resolves.toMatchObject({
      ok: true,
      file: {
        sections: [
          { content: [{ content: [{ text: 'Alternate prefixes', marks: [{ type: 'bold' }] }] }] },
        ],
      },
    });
  });

  it('DOCE-IMPORT-2.1 accepts UTF-16 XML and reports malformed encoded XML as damaged', async () => {
    const parts = packageParts({});
    const document = parts.find((part) => part.path === 'word/document.xml');
    if (!document) throw new Error('Missing document');
    const xml = `\ufeff${document.data}`;
    const utf16 = new Uint8Array(xml.length * 2);
    const view = new DataView(utf16.buffer);
    for (let index = 0; index < xml.length; index += 1) {
      view.setUint16(index * 2, xml.charCodeAt(index), true);
    }
    const packDocument = (data: Uint8Array) =>
      writeZip(parts.map((part) => (part === document ? { ...part, data } : part)));
    await expect(readDocx(packDocument(utf16))).resolves.toMatchObject({ ok: true });
    await expect(readDocx(packDocument(utf16.subarray(0, -1)))).resolves.toMatchObject({
      ok: false,
      failure: 'damaged',
    });
  });

  it.each([
    '<unrelated><w:body/></unrelated>',
    '<w:document/>',
    '<w:document xmlns:w="urn:unrelated"><w:body/></w:document>',
    '<w:document><w:body/><w:body/></w:document>',
    '<w:document><w:body/></w:document><second/>',
  ])('DOCE-IMPORT-2.1 refuses an invalid main document %s', async (main) => {
    await expect(readDocx(pack({ 'word/document.xml': main }))).resolves.toMatchObject({
      ok: false,
      failure: 'damaged',
    });
  });
});
