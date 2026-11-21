import { describe, expect, it } from 'vitest';
import { blockBuilders, standInBlockLayout } from '../../../test/layout-engine-fixtures.js';
import type { TemplateFile } from '../../model/index.js';
import { createDocumentSchema } from '../../model/schema/document-schema.js';
import { BASE_TEMPLATE } from '../../model/templates/base-template.js';

const schema = createDocumentSchema();
const { node, paragraph, heading } = blockBuilders(schema);
const place = { width: 600 };

const template: TemplateFile = {
  ...BASE_TEMPLATE,
  header: { height: '60px', spacingToContent: '12px' },
  footer: { spacingToContent: '9px' },
  footnotes: { separator: { thickness: '2px' }, spacingToContent: '10px', entrySpacing: '4px' },
};

describe('page regions', () => {
  it('DOCE-PAGINATION-10.6 keeps a header at the template’s height, its blocks without margins', () => {
    const { layout } = standInBlockLayout({ template });
    const header = node('page_header', null, [heading(10), paragraph(10)]);
    expect(layout.layoutRegion(header, place)).toEqual({
      ok: true,
      height: 60,
      gap: 12,
      children: [
        { top: 0, bottom: 26, measurement: expect.anything() as unknown },
        { top: 26, bottom: 44, measurement: expect.anything() as unknown },
      ],
      provisional: false,
    });
    const footer = node('page_footer', null, [paragraph(250)]);
    expect(layout.layoutRegion(footer, place)).toMatchObject({ ok: true, height: 54, gap: 9 });
  });

  it('DOCE-PAGINATION-10.6 draws no empty region', () => {
    const { layout } = standInBlockLayout({ template });
    expect(layout.layoutRegion(node('page_header', null), place)).toMatchObject({
      height: 0,
      gap: 0,
    });
    expect(layout.layoutRegion(node('page_footnotes', null), place)).toMatchObject({ height: 0 });
    expect(layout.layoutRegion(node('paragraph', null), place)).toMatchObject({ ok: false });
  });

  it('DOCE-PAGINATION-10.6 sets footnotes under the separator, the template’s spacing apart', () => {
    const { layout } = standInBlockLayout({ template });
    const entry = (length: number) =>
      node('footnote_entry', { footnoteId: 'n1' }, [schema.text('f'.repeat(length))]);
    const area = node('page_footnotes', null, [entry(20), entry(150)]);
    const result = layout.layoutRegion(area, place);
    expect(result).toMatchObject({ ok: true, height: 2 + 10 + 14 + 4 + 28, gap: 0 });
    expect(result.ok && result.children.map(({ top, bottom }) => [top, bottom])).toEqual([
      [0, 14],
      [18, 46],
    ]);
    const { layout: plain } = standInBlockLayout({
      template: { ...template, footnotes: { separator: { enabled: false } } },
    });
    // No separator, and the base spacing of 12pt and 6pt.
    expect(plain.layoutRegion(area, place)).toMatchObject({ height: 16 + 14 + 8 + 28 });
  });
});
