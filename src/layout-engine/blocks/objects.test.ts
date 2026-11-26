import type { Node } from 'prosemirror-model';
import { describe, expect, it, vi } from 'vitest';
import {
  blockBuilders,
  standInBlockLayout,
  standInTextLayout,
} from '../../../test/layout-engine-fixtures.js';
import { isTextMeasurement, type LayoutBlock } from '../../model/index.js';
import { createDocumentSchema } from '../../model/schema/document-schema.js';
import { fixedImageBox } from './objects.js';
import type { BlockGeometry, BlockTextLayout } from './types.js';

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

  it('DOCE-PAGINATION-10.4 narrows a wide image and scales one set to the page width, each whole', () => {
    const wide = figure({ width: 800, height: 200 });
    expect(fixedImageBox(wide, 600)).toEqual({ width: 600, height: 150 });
    const fitted = figure({ width: 300, height: 200, objectLayout: 'fit-page-width' });
    expect(fixedImageBox(fitted, 600)).toEqual({ width: 600, height: 400 });
    expect(fixedImageBox(figure({ width: 300, height: 200 }), 600)).toEqual({
      width: 300,
      height: 200,
    });
  });

  it('DOCE-LABS-4.14 DOCE-PAGINATION-11.2 lays a caption out aligned where its figure is, one across the page width as its own', () => {
    const standIn = standInTextLayout();
    const aligns: unknown[] = [];
    const text: BlockTextLayout = {
      ...standIn,
      layoutText: (line, at) => {
        aligns.push(at.align);
        return standIn.layoutText(line, at);
      },
    };
    const { layout } = standInBlockLayout({ text });
    for (const objectLayout of ['center', 'right', 'left', 'fit-page-width', null]) {
      layout.layoutBlock(figure({ width: 300, height: 200, objectLayout }, 10), place);
    }
    expect(aligns).toEqual(['center', 'right', 'left', undefined, undefined]);
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

describe('later parts of code', () => {
  it("DOCE-PAGINATION-11.2 measures how much taller a later part's caption, with the continued suffix, is", () => {
    const standIn = standInTextLayout();
    // A later part's caption shows its text and " (continued)": as the stand-in counts them.
    const text: BlockTextLayout = {
      ...standIn,
      layoutText: (line, at) => {
        const shown: unknown = line.attrs.continuedText;
        if (typeof shown !== 'string') return standIn.layoutText(line, at);
        const copy = line.type.create(null, schema.text(`${shown} (continued)`));
        return standIn.layoutText(copy, at);
      },
    };
    const labelOf = (line: Node) =>
      line.type.name === 'code_caption' ? 'Code Block 1.1 - ' : undefined;
    const { layout } = standInBlockLayout({ text, labelOf });
    // The 17-character label and 80 characters fill a line of 97; " (continued)" takes another.
    const held = node('code_figure', null, [caption('code_caption', 80), code(10)]);
    const block = blockOf(layout.layoutBlock(held, place));
    expect(block.height).toBe(16 + 9 + 15 + 16);
    expect(block.measurement).toMatchObject({ continuedCaption: 16 });
    // A later part's own caption is already the continued one.
    const later = node('code_figure', null, [
      node('code_caption', { continuedText: 'c'.repeat(80) }),
      code(10, { codeBlockContinued: true }),
    ]);
    const part = blockOf(layout.layoutBlock(later, place));
    expect(part.height).toBe(32 + 9 + 15 + 16);
    expect(part.measurement).not.toHaveProperty('continuedCaption');
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

  it('DOCE-PAGINATION-12.10 scales a display equation wider than its line less its tag and an em down to fit', () => {
    const svg = { tag: 'svg', attrs: {}, children: [] };
    // 30px of tag and the stand-in's 10px em.
    const tag = { width: 30, ascent: 10, descent: 3, svg, missing: '' };
    const math = { math: { width: 1120, ascent: 30, descent: 12, svg, missing: '' }, tag };
    const placed = vi.fn();
    const { layout } = standInBlockLayout({
      measure: () => ({ size: { width: 1160, height: 42, math } }),
      onMath: placed,
    });
    const equation = node('math_display', null, [schema.text('x')]);
    // 560px for the equation beside its tag and the em: half its size, 15px above its baseline and 6px below.
    expect(blockOf(layout.layoutBlock(equation, place))).toMatchObject({
      height: 21,
      marginTop: 6,
      marginBottom: 6,
    });
    expect(placed).toHaveBeenCalledWith(equation, {
      ...math,
      box: { width: 560, ascent: 15, descent: 6, scale: 0.5 },
      end: 40,
    });
  });

  it('DOCE-PAGINATION-12.10 fits a display equation into its line less its automatic number and an em', () => {
    const svg = { tag: 'svg', attrs: {}, children: [] };
    const math = { math: { width: 1120, ascent: 30, descent: 12, svg, missing: '' } };
    const placed = vi.fn();
    const equation = node('math_display', null, [schema.text('x')]);
    const { layout } = standInBlockLayout({
      measure: () => ({ size: { width: 1120, height: 42, math } }),
      onMath: placed,
      equationOf: (of) => (of === equation ? '(4)' : undefined),
    });
    layout.layoutBlock(equation, place);
    // The number and the em before it take 40px at the stand-in's ten a character: 560px are left.
    expect(placed).toHaveBeenCalledWith(
      equation,
      expect.objectContaining({ box: expect.objectContaining({ width: 560 }) as unknown, end: 40 }),
    );
  });

  it('DOCE-PAGINATION-12.10 sets a tag and an automatic number side by side, the equation fitted in what is left', () => {
    const svg = { tag: 'svg', attrs: {}, children: [] };
    const tag = { width: 30, ascent: 10, descent: 3, svg, missing: '' };
    const math = { math: { width: 1080, ascent: 30, descent: 12, svg, missing: '' }, tag };
    const placed = vi.fn();
    const equation = node('math_display', null, [schema.text('x')]);
    const { layout } = standInBlockLayout({
      measure: () => ({ size: { width: 1110, height: 42, math } }),
      onMath: placed,
      equationOf: () => '(4)',
    });
    layout.layoutBlock(equation, place);
    // The tag, an em, the number and an em before the equation: 30 + 10 + 30 + 10, so 520px are
    // left; the tag sits 40px from the line's end, past the number and its em.
    expect(placed).toHaveBeenCalledWith(
      equation,
      expect.objectContaining({
        box: expect.objectContaining({ width: 520 }) as unknown,
        end: 80,
        tagEnd: 40,
      }),
    );
  });

  it('DOCE-PAGINATION-10.4 gives a rule its border, half its text size (12px) above and below, and a page break no height', () => {
    const { layout } = standInBlockLayout();
    expect(blockOf(layout.layoutBlock(node('horizontal_rule', null), place))).toMatchObject({
      height: 2,
      marginTop: 6,
      marginBottom: 6,
    });
    expect(blockOf(layout.layoutBlock(node('page_break', null), place))).toMatchObject({
      height: 0,
      marginTop: 0,
      marginBottom: 0,
    });
  });

  it('DOCE-PAGINATION-10.8 takes the margins a block atom is drawn with, its content’s that pass through its edges among them', () => {
    const { layout } = standInBlockLayout({
      measure: () => ({ size: { width: 600, height: 18, margins: { top: 0, bottom: 8 } } }),
    });
    const markup = node('dynamic_template', { renderedHtml: '<p>a</p>' });
    expect(blockOf(layout.layoutBlock(markup, place))).toMatchObject({
      height: 18,
      marginTop: 0,
      marginBottom: 8,
    });
    // An equation keeps the stylesheet's margins where it is drawn with less.
    const equation = node('math_display', null, [schema.text('x')]);
    expect(blockOf(layout.layoutBlock(equation, place))).toMatchObject({
      marginTop: 6,
      marginBottom: 8,
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
