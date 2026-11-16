// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildDocx, paragraph, run } from '../../../test/fixtures/docx/build-docx-fixture.js';
import { writeZip } from '../../model/format/zip.js';
import { readDocx } from './read-docx.js';

const RELS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const OFFICE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

// A package with the given files besides a plain main document at `main`.
function pack(files: Record<string, string>, main = 'word/document.xml'): Uint8Array {
  return writeZip([
    {
      path: '[Content_Types].xml',
      data: '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>',
    },
    {
      path: '_rels/.rels',
      data: `<Relationships xmlns="${RELS}"><Relationship Id="rId1" Type="${OFFICE}/officeDocument" Target="${main}"/></Relationships>`,
    },
    {
      path: main,
      data: '<w:document xmlns:w="w"><w:body><w:p><w:r><w:t>Hi</w:t></w:r></w:p></w:body></w:document>',
    },
    ...Object.entries(files).map(([path, data]) => ({ path, data })),
  ]);
}

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
});
