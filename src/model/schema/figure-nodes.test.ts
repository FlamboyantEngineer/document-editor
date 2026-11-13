import { DOMSerializer } from 'prosemirror-model';
import { describe, expect, it } from 'vitest';
import {
  documentSchema,
  findNode,
  parseMarkup,
  roundTrip,
  writeMarkup,
} from '../../../test/document-markup.js';
import { createDocumentSchema } from '../index.js';

const previewSchema = createDocumentSchema({
  schema: { assetPreviewUrl: (asset, snapshot) => `/files/${asset}/${snapshot}` },
});

const CAPTION =
  '<figcaption class="doc-caption-line doc-figure-caption-line" data-caption-kind="figure"><span class="doc-caption-text" data-doc-caption-text="true">Chart</span><span class="doc-caption-continued" data-doc-caption-continued="true"></span></figcaption>';

describe('figure nodes', () => {
  it('DOCE-SCHEMA-3.3 keeps an addressed image figure with its caption, size and alignment', () => {
    const html = `<figure data-object-layout="center" data-figure-width="320" data-figure-height="200" data-figure-src="https://example.com/a.png" data-figure-type="image"><img src="https://example.com/a.png" alt="Chart" loading="lazy" decoding="async" style="display: block; width: 320px; height: 200px; margin-left: auto; margin-right: auto; max-width: 100%; object-fit: contain;" width="320" height="200">${CAPTION}</figure>`;
    const figure = findNode(parseMarkup(html), 'figure');
    expect(figure?.attrs).toMatchObject({
      src: 'https://example.com/a.png',
      caption: 'Chart',
      objectLayout: 'center',
      width: 320,
      height: 200,
    });
    expect(roundTrip(html)).toBe(html);
  });

  it('DOCE-SCHEMA-3.3 writes a size only when it is a positive number', () => {
    const figure = documentSchema.nodes.figure;
    if (!figure) throw new Error('The schema has figures');
    const written = (attrs: Record<string, unknown>) =>
      DOMSerializer.fromSchema(documentSchema).serializeNode(
        figure.create({ src: 'a.png', ...attrs }),
      ) as HTMLElement;
    // A stored or synced figure holds what it was given: text that is not a size is not written.
    const unsafe = written({ width: '1px;position:fixed;inset:0', height: -5 });
    const image = unsafe.querySelector('img');
    expect(image).not.toHaveStyle({ position: 'fixed' });
    expect(image).not.toHaveAttribute('width');
    expect(image).not.toHaveAttribute('height');
    expect(unsafe).not.toHaveAttribute('data-figure-width');
    expect(unsafe).not.toHaveAttribute('data-figure-height');
    const fitted = written({
      objectLayout: 'fit-page-width',
      width: '2/1;position:fixed',
      height: 1,
    });
    expect(fitted.querySelector('img')).not.toHaveStyle({ position: 'fixed' });
    expect(written({ width: 320, height: 200 }).querySelector('img')).toHaveStyle({
      width: '320px',
      height: '200px',
    });
    // Markup with a size that is not a number reads as a figure with no size.
    const pasted = `<figure data-figure-width="wide" data-figure-height="-3"><img src="a.png">${CAPTION}</figure>`;
    expect(findNode(parseMarkup(pasted), 'figure')?.attrs).toMatchObject({
      width: null,
      height: null,
    });
  });

  it('DOCE-SCHEMA-3.3 stores an uploaded figure as its asset and previews it where the host says', () => {
    const html = `<figure data-file-asset-id="a1" data-snapshot-id="s1" data-figure-src="/old/address" data-figure-type="image"><img src="/old/address" alt="figure">${CAPTION}</figure>`;
    const figure = findNode(parseMarkup(html), 'figure');
    expect(figure?.attrs).toMatchObject({ src: '', fileAssetId: 'a1', snapshotId: 's1' });
    expect(roundTrip(html)).toContain('data-file-asset-id="a1" data-snapshot-id="s1"');
    const previewed = writeMarkup(parseMarkup(html, previewSchema), previewSchema);
    expect(previewed).toContain('data-figure-src="/files/a1/s1"');
    expect(previewed).toContain('<img src="/files/a1/s1"');
  });

  it('DOCE-SCHEMA-3.3 shows a placeholder for a diagram with no stored rendering', () => {
    const html = `<figure data-figure-type="diagram"><img src="x">${CAPTION}</figure>`;
    const written = roundTrip(html);
    expect(written).toContain('data-figure-type="diagram"');
    expect(written).toContain('src="data:image/svg+xml;charset=utf-8,');
    expect(written).toContain('alt="Chart"');
  });

  it('DOCE-SCHEMA-3.3 keeps an inline image and its tooltip', () => {
    const html = '<p><img src="https://example.com/i.png" alt="Icon" title="Tip"></p>';
    const image = findNode(parseMarkup(html), 'image');
    expect(image?.attrs).toMatchObject({ alt: 'Icon', title: 'Tip', templateAssetImage: false });
    expect(roundTrip(html)).toBe(
      '<p><img src="https://example.com/i.png" alt="Icon" title="Tip" loading="lazy" decoding="async"></p>',
    );
  });

  it('DOCE-SCHEMA-3.3 places a template image in an aligned wrapper at its stored size', () => {
    const html =
      '<p><img src="templateFile:f1:s1" data-template-image-width="80" data-template-image-alignment="right"></p>';
    const image = findNode(parseMarkup(html), 'image');
    expect(image?.attrs).toMatchObject({
      templateAssetImage: true,
      templateFileId: 'f1',
      templateSnapshotId: 's1',
      templateImageWidth: 80,
      templateImageAlignment: 'right',
    });
    const written = roundTrip(html);
    expect(written).toContain(
      '<span data-template-asset-image-wrapper="true" data-template-image-alignment="right" data-image-missing="true" style="display: block; text-align: right; line-height: 0;">',
    );
    expect(written).toContain('width="80" height="96"');
    expect(roundTrip(written)).toBe(written);
  });
});
