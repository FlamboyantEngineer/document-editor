import { DOMSerializer } from 'prosemirror-model';
import { afterEach, describe, expect, it } from 'vitest';
import {
  documentSchema,
  findNode,
  parseMarkup,
  roundTrip,
  writeMarkup,
} from '../../../test/document-markup.js';
import { createDocumentSchema } from '../index.js';
import { createFigure } from './caption-content.js';

const previewSchema = createDocumentSchema({
  schema: { assetPreviewUrl: (asset, snapshot) => `/files/${asset}/${snapshot}` },
});

const CAPTION =
  '<figcaption class="doc-caption-line doc-figure-caption-line" data-caption-kind="figure"><span class="doc-caption-text" data-doc-caption-text="true">Chart</span><span class="doc-caption-continued" data-doc-caption-continued="true"></span></figcaption>';

// What the editor writes for a figure whose image markup ends `image`: the caption in its slot.
const written = (html: string) =>
  html.replace(`${CAPTION}`, `<div class="doc-figure-caption-slot">${CAPTION}</div>`);

afterEach(() => {
  document.body.replaceChildren();
});

describe('figure nodes', () => {
  it('DOCE-SCHEMA-3.3 keeps an addressed image figure with its caption, size and alignment', () => {
    const html = `<figure data-object-layout="center" data-figure-width="320" data-figure-height="200" data-figure-src="https://example.com/a.png" data-figure-type="image"><span class="doc-figure-image" style="display: block; width: 320px; max-width: 100%; aspect-ratio: 320 / 200; overflow: hidden; margin-left: auto; margin-right: auto;" contenteditable="false"><img src="https://example.com/a.png" alt="Chart" loading="lazy" decoding="async" style="display: block; width: 100%; height: 100%; object-fit: contain;" width="320" height="200"></span>${CAPTION}</figure>`;
    const figure = findNode(parseMarkup(html), 'figure');
    expect(figure?.attrs).toMatchObject({
      src: 'https://example.com/a.png',
      objectLayout: 'center',
      width: 320,
      height: 200,
    });
    expect(figure?.textContent).toBe('Chart');
    expect(roundTrip(html)).toBe(written(html));
    expect(roundTrip(written(html))).toBe(written(html));
  });

  it('DOCE-SCHEMA-3.3 DOCE-SCHEMA-3.14 takes only a positive size, which every figure has', () => {
    // A figure as the document holds it, with its caption.
    const written = (attrs: Record<string, unknown>) => {
      const figure = createFigure(documentSchema, { src: 'a.png', ...attrs });
      if (!figure) throw new Error('The schema has figures');
      const dom = DOMSerializer.fromSchema(documentSchema).serializeNode(figure) as HTMLElement;
      // Only an element in the document has a computed style, as in a browser.
      return document.body.appendChild(dom);
    };
    // A figure without a size, or with text that is not one, cannot be made.
    expect(() => written({})).toThrow(RangeError);
    expect(() => written({ width: '1px;position:fixed;inset:0', height: -5 })).toThrow(
      /positive number of pixels/,
    );
    // The frame holds the size whether or not the image loads, and the image fills it.
    const shown = written({ width: 320, height: 200 });
    expect(shown.querySelector('.doc-figure-image')).toHaveStyle({
      width: '320px',
      maxWidth: '100%',
      aspectRatio: '320 / 200',
    });
    expect(shown.querySelector('img')).toHaveStyle({ width: '100%', height: '100%' });
    // Markup with no size, or one that is not a number, reads as no figure: its image has no size
    // either, so nothing is read but its caption's text.
    const pasted = `<figure data-figure-width="wide" data-figure-height="-3"><img src="a.png">${CAPTION}</figure>`;
    expect(findNode(parseMarkup(pasted), 'figure')).toBeUndefined();
    expect(findNode(parseMarkup(pasted), 'image')).toBeUndefined();
    // A figure from another application, sized by its image, is read at that size.
    const other =
      '<figure><img src="a.png" width="64" height="48"><figcaption>Chart</figcaption></figure>';
    expect(findNode(parseMarkup(other), 'figure')?.attrs).toMatchObject({ width: 64, height: 48 });
  });

  it('DOCE-SCHEMA-3.3 stores an uploaded figure as its asset and previews it where the host says', () => {
    const html = `<figure data-figure-width="40" data-figure-height="30" data-file-asset-id="a1" data-snapshot-id="s1" data-figure-src="/old/address" data-figure-type="image"><img src="/old/address" alt="figure">${CAPTION}</figure>`;
    const figure = findNode(parseMarkup(html), 'figure');
    expect(figure?.attrs).toMatchObject({ src: '', fileAssetId: 'a1', snapshotId: 's1' });
    expect(roundTrip(html)).toContain('data-file-asset-id="a1" data-snapshot-id="s1"');
    const previewed = writeMarkup(parseMarkup(html, previewSchema), previewSchema);
    expect(previewed).toContain('data-figure-src="/files/a1/s1"');
    expect(previewed).toContain('<img src="/files/a1/s1"');
  });

  it('DOCE-SCHEMA-3.3 shows a placeholder for a diagram with no stored rendering', () => {
    const html = `<figure data-figure-type="diagram" data-figure-width="64" data-figure-height="32"><img src="x">${CAPTION}</figure>`;
    const written = roundTrip(html);
    expect(written).toContain('data-figure-type="diagram"');
    expect(written).toContain('src="data:image/svg+xml;charset=utf-8,');
    expect(written).toContain('alt="Chart"');
  });

  it('DOCE-SCHEMA-3.3 DOCE-SCHEMA-3.14 keeps an inline image, its size and its tooltip, and reads none without a size', () => {
    const html =
      '<p><img src="https://example.com/i.png" alt="Icon" title="Tip" width="16" height="12"></p>';
    const image = findNode(parseMarkup(html), 'image');
    expect(image?.attrs).toMatchObject({
      alt: 'Icon',
      title: 'Tip',
      templateAssetImage: false,
      templateImageWidth: 16,
      templateImageHeight: 12,
    });
    expect(roundTrip(html)).toBe(
      '<p><img src="https://example.com/i.png" alt="Icon" title="Tip" width="16" height="12" loading="lazy" decoding="async"></p>',
    );
    expect(
      findNode(parseMarkup('<p>A <img src="i.png" width="16"> b</p>'), 'image'),
    ).toBeUndefined();
  });

  it('DOCE-SCHEMA-3.3 places a template image in an aligned wrapper at its stored size', () => {
    const html =
      '<p><img src="templateFile:f1:s1" data-template-image-width="80" data-template-image-height="40" data-template-image-alignment="right"></p>';
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
      '<span data-template-asset-image-wrapper="true" data-template-image-alignment="right" data-image-missing="true" style="display: inline-block; inline-size: 100%; text-align: right; line-height: 0;">',
    );
    expect(written).toContain('width="80" height="40"');
    expect(roundTrip(written)).toBe(written);
  });
});
