import { describe, expect, it } from 'vitest';
import {
  documentSchema,
  findNode,
  parseMarkup,
  writeMarkup,
} from '../../../test/document-markup.js';
import {
  BASE_TEMPLATE,
  createDocumentSchema,
  readDocumentFile,
  type StoredNode,
  type TemplateFile,
  templateImageErrors,
  templateImageRefs,
  writeDocumentFile,
} from '../index.js';

const image = (attrs: Record<string, unknown>): StoredNode => ({ type: 'image', attrs });
const paragraph = (...content: StoredNode[]): StoredNode => ({ type: 'paragraph', content });

const read = (schema = documentSchema, ...content: StoredNode[]) =>
  readDocumentFile({ formatVersion: 1, sections: [{ name: null, content }] }, schema);

describe('template images', () => {
  it('DOCE-SCHEMA-3.3 renders a template image by its asset, as of the time the host gives', () => {
    const asked: unknown[] = [];
    let asOf: string | null = null;
    const schema = createDocumentSchema({
      schema: {
        assetPreviewUrl: (asset, snapshot, at) => {
          asked.push([asset, snapshot, at?.asOf ?? null]);
          return `/files/${asset}/${snapshot}${at?.asOf ? `?at=${at.asOf}` : ''}`;
        },
        assetsAsOf: () => asOf,
      },
    });
    const doc = read(schema, paragraph(image({ assetId: 'logo', assetRevision: 's2', width: 80 })));
    expect(writeMarkup(doc, schema)).toContain('src="/files/logo/s2"');
    asOf = '2026-01-31T00:00:00Z';
    expect(writeMarkup(doc, schema)).toContain('src="/files/logo/s2?at=2026-01-31T00:00:00Z"');
    expect(asked).toEqual([
      ['logo', 's2', null],
      ['logo', 's2', '2026-01-31T00:00:00Z'],
    ]);
  });

  it('DOCE-SCHEMA-3.3 stores a template image without an address and marks one not found', () => {
    const doc = read(
      documentSchema,
      paragraph(image({ assetId: 'logo', assetRevision: 's2', width: 80 })),
    );
    const written = writeMarkup(doc);
    expect(written).toContain('data-image-missing="true"');
    expect(written).not.toContain('src=');
    expect(findNode(parseMarkup(written), 'image')?.attrs).toMatchObject({
      src: '',
      templateFileId: 'logo',
      templateSnapshotId: 's2',
      templateImageWidth: 80,
    });
    const addressed = parseMarkup('<p><img src="/old/logo.png" data-template-file-id="logo"></p>');
    expect(findNode(addressed, 'image')?.attrs.src).toBe('');
    expect(writeDocumentFile(doc).sections[0]?.content).toEqual([
      paragraph(image({ assetId: 'logo', assetRevision: 's2', width: 80 })),
    ]);
  });

  it('DOCE-SCHEMA-3.3 lists the assets a template shows and refuses images stored by address', () => {
    const template: TemplateFile = {
      ...BASE_TEMPLATE,
      header: { content: [paragraph(image({ assetId: 'logo', assetRevision: 's2' }))] },
      sections: [
        {
          name: 'cover',
          content: [
            paragraph(
              image({ assetId: 'banner' }),
              image({ assetId: 'logo', assetRevision: 's2' }),
            ),
            { type: 'figure', attrs: { assetId: 'chart', assetRevision: 's1' } },
          ],
          footer: { content: [paragraph(image({ src: 'https://example.com/seal.png' }))] },
        },
      ],
    };
    expect(templateImageRefs(template)).toEqual([
      { fileAssetId: 'logo', snapshotId: 's2' },
      { fileAssetId: 'banner', snapshotId: '' },
      { fileAssetId: 'chart', snapshotId: 's1' },
    ]);
    expect(templateImageErrors(template)).toEqual([
      'template.sections[0].footer.content[0].content[0]: a template image is stored by its asset, not by an address (src)',
    ]);
    expect(templateImageErrors(BASE_TEMPLATE)).toEqual([]);
  });
});
