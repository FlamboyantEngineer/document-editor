import { describe, expect, it, vi } from 'vitest';
import { blockBuilders, standInBlockLayout } from '../../../test/layout-engine-fixtures.js';
import { isTextMeasurement, type LayoutBlock } from '../../model/index.js';
import { createDocumentSchema } from '../../model/schema/document-schema.js';
import { fixedImageBox } from './objects.js';
import type { BlockGeometry } from './types.js';

const schema = createDocumentSchema();
const { node, code, caption } = blockBuilders(schema);
const place = { width: 600 };

function blockOf(geometry: BlockGeometry): LayoutBlock {
  if (!geometry.ok) throw new Error(geometry.reason);
  return geometry.block;
}

const figure = (attrs: Record<string, unknown>, length = 0) =>
  node('figure', { src: 'https://example.org/a.png', ...attrs }, [
    caption('figure_caption', length),
  ]);

describe('figures', () => {
  it('DOCE-PAGINATION-10.4 sizes an image from its stored size without measuring it', () => {
    const measure = vi.fn(() => ({ size: { width: 1, height: 1 } }));
    const { layout } = standInBlockLayout({ measure });
    const block = blockOf(layout.layoutBlock(figure({ width: 300, height: 200 }, 10), place));
    expect(block).toMatchObject({ height: 200 + 16, marginTop: 0, marginBottom: 8 });
    expect(measure).not.toHaveBeenCalled();
  });

  it('DOCE-PAGINATION-10.4 narrows a wide image and scales one set to the page width', () => {
    const wide = figure({ width: 800, height: 200 });
    expect(fixedImageBox(wide, 600)).toEqual({ width: 600, height: 200 });
    const fitted = figure({ width: 800, height: 200, objectLayout: 'fit-page-width' });
    expect(fixedImageBox(fitted, 600)).toEqual({ width: 600, height: 150 });
    expect(fixedImageBox(figure({ width: 800 }), 600)).toBeNull();
  });

  it('DOCE-PAGINATION-10.4 measures an unsized image as an atom, without its caption when off', () => {
    const { layout } = standInBlockLayout({ measure: () => ({ size: { width: 90, height: 40 } }) });
    const block = blockOf(layout.layoutBlock(figure({ captionEnabled: false }, 10), place));
    expect(block.height).toBe(40);
    const { layout: blind } = standInBlockLayout({ measure: () => null });
    expect(blind.layoutBlock(figure({}), place)).toMatchObject({ ok: false });
  });

  it('DOCE-PAGINATION-10.2 marks a figure whose image still loads as provisional', () => {
    const settled = new Promise<{ width: number; height: number }>(() => undefined);
    const { layout } = standInBlockLayout({
      measure: () => ({ size: { width: 0, height: 0 }, settled }),
    });
    expect(layout.layoutBlock(figure({}), place)).toMatchObject({ ok: true, provisional: true });
  });
});

describe('code', () => {
  it('DOCE-PAGINATION-10.4 boxes code with its caption above, a rule and space between', () => {
    const { layout } = standInBlockLayout();
    // 584px inside the padding holds 97 characters: 200 take three 15px lines, padded by 16.
    const held = node('code_figure', null, [caption('code_caption', 10), code(200)]);
    const block = blockOf(layout.layoutBlock(held, place));
    expect(block).toMatchObject({ height: 16 + 9 + 45 + 16, marginTop: 10, marginBottom: 10 });
    const bare = node('code_figure', null, [
      caption('code_caption', 10),
      code(200, { captionEnabled: false }),
    ]);
    expect(blockOf(layout.layoutBlock(bare, place)).height).toBe(61);
  });

  it('DOCE-PAGINATION-10.4 passes the caption’s label to the text layout', () => {
    const { layout } = standInBlockLayout({
      labelOf: (line) => (line.type.name === 'code_caption' ? 'Code Block 1.1 - ' : undefined),
    });
    // The 17-character label and 90 characters of caption need two lines of 97.
    const held = node('code_figure', null, [caption('code_caption', 90), code(10)]);
    expect(blockOf(layout.layoutBlock(held, place)).height).toBe(32 + 9 + 15 + 16);
  });
});

describe('linked code', () => {
  it('DOCE-PAGINATION-10.4 lays linked code out as a captioned code block, its lines from its code', () => {
    const { layout } = standInBlockLayout({
      labelOf: (line) => (line.type.name === 'linked_code_block' ? 'Code Block 2 - ' : undefined),
    });
    // The caption reads "main.py" after its 15-character label: one line of 16px. The code's 200
    // characters take three 15px lines of 97, padded by 16.
    const linked = node('linked_code_block', {
      url: 'https://example.org/src/main.py',
      code: 'x'.repeat(200),
    });
    const block = blockOf(layout.layoutBlock(linked, place));
    expect(block).toMatchObject({ node: linked, height: 16 + 9 + 45 + 16, marginTop: 10 });
    expect(isTextMeasurement(block.measurement)).toBe(true);
    if (!isTextMeasurement(block.measurement)) return;
    expect(block.measurement.measure(0, 97)).toEqual({ height: 15, lines: 1 });
  });
});

describe('equations, rules and markup', () => {
  it('DOCE-PAGINATION-10.4 measures a display equation as an atom with 6px margins', () => {
    const measure = vi.fn(() => ({ size: { width: 200, height: 40 } }));
    const { layout } = standInBlockLayout({ measure });
    const equation = node('math_display', null, [schema.text('a^2 + b^2')]);
    expect(blockOf(layout.layoutBlock(equation, place))).toMatchObject({
      height: 40,
      marginTop: 6,
      marginBottom: 6,
    });
    layout.layoutBlock(equation, place);
    expect(measure).toHaveBeenCalledTimes(1);
  });

  it('DOCE-PAGINATION-10.4 gives a rule its border and a page break no height', () => {
    const { layout } = standInBlockLayout();
    expect(blockOf(layout.layoutBlock(node('horizontal_rule', null), place))).toMatchObject({
      height: 2,
      // The browser's `0.5em` in the base template's 12px paragraphs.
      marginTop: 6,
      marginBottom: 6,
    });
    expect(blockOf(layout.layoutBlock(node('page_break', null), place))).toMatchObject({
      height: 0,
      marginTop: 0,
      marginBottom: 0,
    });
  });

  it('DOCE-PAGINATION-10.4 measures a kept block as an atom', () => {
    const { layout } = standInBlockLayout({
      measure: () => ({ size: { width: 600, height: 33 } }),
    });
    const kept = node('kept_block', { stored: { type: 'host_box' } });
    expect(blockOf(layout.layoutBlock(kept, place))).toMatchObject({ height: 33, marginBottom: 0 });
  });
});
