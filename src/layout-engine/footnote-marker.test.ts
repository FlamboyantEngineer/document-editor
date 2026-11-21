import { beforeEach, describe, expect, it } from 'vitest';
import { installFakeCanvas } from '../../test/canvas-fixtures.js';
import { documentSchema } from '../../test/document-markup.js';
import type { TemplateFile } from '../model/format/template-format.js';
import { BASE_TEMPLATE } from '../model/templates/base-template.js';
import { createTextLayout } from './text-layout.js';
import { blockTypography } from './typography.js';

function entry(text: string) {
  const node = documentSchema.nodes.footnote_entry?.create(null, documentSchema.text(text));
  if (!node) throw new Error('schema has no footnote entry');
  return node;
}

const bare: TemplateFile = { formatVersion: 1, id: 'bare', name: 'Bare' };

beforeEach(() => {
  installFakeCanvas();
});

describe('footnote entries', () => {
  it('DOCE-PAGINATION-9.10 lays an entry out in the footnote text style, without margins', () => {
    expect(blockTypography(entry('a'), { template: BASE_TEMPLATE })).toMatchObject({
      font: { family: 'Arial', size: 10, weight: 400, italic: false },
      leading: 14,
      align: 'left',
      marginTop: 0,
      marginBottom: 0,
    });
    expect(blockTypography(entry('a'), { template: bare })).toMatchObject({
      font: { family: 'serif', size: 10 },
      leading: 14,
    });
  });

  it('DOCE-PAGINATION-9.10 draws the number in the marker style with its suffix and a gap', () => {
    const engine = createTextLayout({ template: BASE_TEMPLATE });
    const laid = engine.layoutText(entry('aaaa'), { width: 400, footnoteNumber: '12' });
    if (!laid.ok) throw new Error(laid.reason);
    // "12." at the 10px marker size is 15px, a quarter of the marker size 2.5px, "aaaa" 20px.
    expect(laid.table.lines[0]).toMatchObject({ from: 0, to: 4, width: 15 + 2.5 + 20 });
    expect(laid.table.height).toBe(14);
    // Without marker settings the number is 0.85 of the entry size and the suffix is empty.
    const plain = createTextLayout({ template: bare }).layoutText(entry('aaaa'), {
      width: 400,
      footnoteNumber: '1',
    });
    if (!plain.ok) throw new Error(plain.reason);
    expect(plain.table.lines[0]?.width).toBeCloseTo(4.25 + 2.125 + 20, 1);
  });

  it('DOCE-PAGINATION-9.10 refuses an entry whose marker font is not served', () => {
    const template: TemplateFile = {
      ...BASE_TEMPLATE,
      footnotes: { ...BASE_TEMPLATE.footnotes, marker: { font: 'Georgia' } },
    };
    const engine = createTextLayout({ template, isFontServed: (family) => family === 'Arial' });
    expect(engine.layoutText(entry('aaaa'), { width: 400 }).ok).toBe(true);
    expect(engine.layoutText(entry('aaaa'), { width: 400, footnoteNumber: '1' })).toEqual({
      ok: false,
      reason: 'font not served: Georgia',
    });
  });
});
