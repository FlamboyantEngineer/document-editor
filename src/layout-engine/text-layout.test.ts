import type * as Pretext from '@chenglou/pretext';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installFakeCanvas } from '../../test/canvas-fixtures.js';
import { documentSchema, findNode, parseMarkup } from '../../test/document-markup.js';
import type { TemplateFile } from '../model/format/template-format.js';
import { planParagraphSplit } from '../model/pagination/text-split.js';
import { BASE_TEMPLATE } from '../model/templates/base-template.js';
import type { LineTable } from './line-table.js';
import { createTextLayout, lineTableMeasurement, type TextLayoutOptions } from './text-layout.js';

const pretext = vi.hoisted(() => ({ locales: [] as (string | undefined)[] }));

vi.mock('@chenglou/pretext', async (original) => {
  const actual = await original<typeof Pretext>();
  return {
    ...actual,
    setLocale: (locale?: string) => {
      pretext.locales.push(locale);
      actual.setLocale(locale);
    },
  };
});

// With the fake Canvas, a 12px character is 6px wide and a space 3px: `aaaa ` is 27px.
const WORDS = 'aaaa bbbb cccc dddd eeee';

function block(markup: string, type = 'paragraph'): ProseMirrorNode {
  const node = findNode(parseMarkup(markup), type);
  if (!node) throw new Error(`no ${type} in ${markup}`);
  return node;
}

function table(node: ProseMirrorNode, width: number, options?: Partial<TextLayoutOptions>) {
  const result = createTextLayout({ template: BASE_TEMPLATE, ...options }).layoutText(node, {
    width,
  });
  if (!result.ok) throw new Error(result.reason);
  return result.table;
}

const starts = (lines: LineTable) => lines.lines.map((line) => [line.from, line.to, line.end]);

beforeEach(() => {
  installFakeCanvas();
  pretext.locales.length = 0;
});

describe('createTextLayout', () => {
  it('DOCE-PAGINATION-9.1 lays a paragraph out on lines that tile its content', () => {
    const lines = table(block(`<p>${WORDS}</p>`), 60);
    expect(starts(lines)).toEqual([
      [0, 10, 'wrap'],
      [10, 20, 'wrap'],
      [20, 24, 'end'],
    ]);
    expect(lines.lines.map((line) => [line.width, line.top, line.height])).toEqual([
      [51, 0, 18],
      [51, 18, 18],
      [24, 36, 18],
    ]);
    expect(lines).toMatchObject({ width: 60, height: 54, overhead: 0 });
  });

  it('DOCE-PAGINATION-9.1 counts the runs it prepares and the runs it finds prepared', () => {
    const engine = createTextLayout({ template: BASE_TEMPLATE });
    const node = block('<p>aa<br>bb</p>');
    engine.layoutText(node, { width: 60 });
    expect(engine.stats()).toEqual({ hits: 0, misses: 2 });
    engine.layoutText(node, { width: 30 });
    expect(engine.stats()).toEqual({ hits: 2, misses: 2 });
  });

  it('DOCE-PAGINATION-9.1 gives an empty paragraph one line', () => {
    expect(table(block('<p></p>'), 60).lines).toEqual([
      { from: 0, to: 0, width: 0, left: 0, top: 0, height: 18, end: 'end' },
    ]);
  });

  it('DOCE-PAGINATION-12.4 lists the clusters its reserve option reserves a width for', () => {
    // Reserves each ☃ and the joined family, in any font, at the font's size.
    const reserve = (cluster: string, font: string) =>
      cluster === '☃' || cluster.includes('\u200d') ? Number(/(\d+)px/u.exec(font)?.[1]) : null;
    const node = block('<p>aa ☃ <strong>b👩\u200d👧</strong></p>');
    expect(table(node, 200, { reserve }).reserved).toEqual([
      { from: 3, to: 4, width: 12 },
      { from: 6, to: 11, width: 12 },
    ]);
    expect(table(node, 200).reserved).toBeUndefined();
    expect(table(block('<p>aa</p>'), 200, { reserve }).reserved).toBeUndefined();
  });

  it('DOCE-PAGINATION-9.3 lays text out in its marks’ fonts, each text node as its own item', () => {
    const plain = table(block(`<p>${WORDS}</p>`), 60);
    const linked = table(
      block('<p>aaaa <a href="https://example.com">bbbb</a> cccc dddd eeee</p>'),
      60,
    );
    expect(starts(linked)).toEqual(starts(plain));
    const bold = table(block('<p><strong>aaaa</strong></p>'), 60);
    expect(bold.lines[0]?.width).toBe(24);
    const code = table(block('<p><code>aaaa</code></p>'), 60);
    expect(code.lines[0]?.width).toBe(26);
    // A line ending inside the code fits without its 3px end padding: "aa aa" with both pads is
    // 28.5px, and fits in 26px.
    expect(table(block('<p><code>aa aa aa</code></p>'), 26).lines).toHaveLength(2);
    expect(table(block('<p><code>aa aa aa</code></p>'), 25).lines).toHaveLength(3);
  });

  it('DOCE-PAGINATION-9.4 ends a line at each hard break, and a final break makes an empty line', () => {
    const lines = table(block('<p>aa<br>bb<br></p>'), 200);
    expect(starts(lines)).toEqual([
      [0, 3, 'break'],
      [3, 6, 'break'],
      [6, 6, 'end'],
    ]);
    expect(lines.height).toBe(54);
  });

  it('DOCE-PAGINATION-9.4 keeps runs of spaces and tabs, which hang at a line end', () => {
    const spaced = documentSchema.nodes.paragraph?.create(
      null,
      documentSchema.text('aaaa    bbbb'),
    );
    if (!spaced) throw new Error('schema has no paragraph');
    const lines = table(spaced, 40);
    expect(starts(lines)).toEqual([
      [0, 8, 'wrap'],
      [8, 12, 'end'],
    ]);
    expect(lines.lines[0]?.width).toBe(24);
    const code = table(block('<pre><code>a\tb</code></pre>', 'code_block'), 400);
    expect(code.lines[0]?.width).toBeGreaterThan(10);
  });

  it('DOCE-PAGINATION-9.5 grows a line to hold text in a taller font, at its inherited line height', () => {
    const template = {
      ...BASE_TEMPLATE,
      styles: {
        ...BASE_TEMPLATE.styles,
        codeBlock: { ...BASE_TEMPLATE.styles?.codeBlock, size: '32px' },
      },
    };
    // A 12px paragraph at 1.5: an 18px line, 13px above the baseline. 32px code at 1.5 takes a 48px
    // box, 26 + 8px above its baseline and 6 + 8px below, so its line is 34 + 14px.
    const lines = table(block('<p>aa<br><code>b</code> a<br><sup>c</sup></p>'), 400, { template });
    expect(lines.lines.map((line) => line.height)).toEqual([18, 48, 18]);
  });

  it('DOCE-PAGINATION-9.5 draws a prefix before the first line and sizes inline atoms', () => {
    const engine = createTextLayout({ template: BASE_TEMPLATE });
    const heading = block('<h1>aaaa</h1>', 'heading');
    const numbered = engine.layoutText(heading, { width: 400, prefix: '1. ' });
    if (!numbered.ok) throw new Error(numbered.reason);
    // 22px: two prefix characters and a space, then four letters.
    expect(numbered.table.lines[0]).toMatchObject({ from: 0, width: 11 * 2 + 5.5 + 11 * 4 });
    const atom = documentSchema.nodes.math_inline?.create();
    const math = documentSchema.nodes.paragraph?.create(null, [
      documentSchema.text('aa'),
      ...(atom ? [atom] : []),
      documentSchema.text('bb'),
    ]);
    if (!math) throw new Error('schema has no paragraph');
    expect(engine.layoutText(math, { width: 400 })).toEqual({
      ok: false,
      reason: 'no size for inline math_inline',
    });
    // The fake Canvas has no font metrics: a 12px font rises 10px and falls 2px, so an 18px line's
    // strut is 13px above the baseline and 5px below.
    const sized = table(math, 400, { measureAtom: () => ({ width: 30, height: 40 }) });
    expect(sized.lines[0]).toMatchObject({ width: 6 * 4 + 30, height: 45 });
    const centred = table(math, 400, {
      measureAtom: () => ({ width: 30, height: 40, baseline: 30 }),
    });
    expect(centred.lines[0]?.height).toBe(40);
    const small = table(math, 400, { measureAtom: () => ({ width: 30, height: 10, baseline: 8 }) });
    expect(small.lines[0]?.height).toBe(18);
  });

  it('DOCE-PAGINATION-9.5 lays footnote markers, mentions and glossary references out as their text', () => {
    const { nodes } = documentSchema;
    const marker = nodes.footnote_reference?.create({ footnoteId: 'f1' });
    const mention = nodes.mention?.create({ userId: 'u1', label: 'Ann Lee' });
    const glossary = nodes.abbreviation_reference?.create({
      entryId: 'g1',
      display: 'short',
      abbr: 'ABC',
      expansion: 'A B C',
    });
    if (!marker || !mention || !glossary) throw new Error('schema lacks an inline atom');
    const paragraph = (atom: ProseMirrorNode) =>
      nodes.paragraph?.create(null, [documentSchema.text('aaaa '), atom]) ?? atom;
    const numbered = (number: string | undefined) =>
      table(paragraph(marker), 400, { textAtoms: { footnoteOf: () => number } });
    // A 12px block's marker is drawn at `font-size: smaller`, 10px: 5px a character.
    expect(numbered('7').lines[0]?.width).toBe(27 + 5);
    expect(numbered('12').lines[0]?.width).toBe(27 + 10);
    expect(numbered(undefined).lines[0]?.width).toBe(27);
    // `@Ann Lee` and `ABC` in the block's font, never broken inside.
    expect(table(paragraph(mention), 400).lines[0]?.width).toBe(27 + 8 * 6 - 3);
    expect(table(paragraph(glossary), 400).lines[0]?.width).toBe(27 + 18);
    expect(starts(table(paragraph(mention), 60))).toEqual([
      [0, 5, 'wrap'],
      [5, 6, 'end'],
    ]);
    // A fragment continuing a split paragraph skips the break it starts with, then lays the
    // mention out as text on its first line.
    const brk = nodes.hard_break?.create();
    const continued = brk
      ? nodes.paragraph?.create({ splitPartIndex: 1 }, [brk, mention, documentSchema.text(' a')])
      : undefined;
    if (!continued) throw new Error('schema lacks a hard break');
    const lines = table(continued, 400).lines;
    expect(lines).toHaveLength(1);
    const whole = nodes.paragraph?.create(null, [mention, documentSchema.text(' a')]);
    if (!whole) throw new Error('schema lacks a paragraph');
    expect(lines[0]?.width).toBe(table(whole, 400).lines[0]?.width);
    // A type the host draws itself is measured as an atom.
    const drawn = createTextLayout({ template: BASE_TEMPLATE, textAtoms: { types: new Set() } });
    expect(drawn.layoutText(paragraph(mention), { width: 400 })).toEqual({
      ok: false,
      reason: 'no size for inline mention',
    });
  });

  it('DOCE-PAGINATION-9.5 tells an inline atom its block and scope', () => {
    const atom = documentSchema.nodes.math_inline?.create(null, documentSchema.text('x'));
    const heading = documentSchema.nodes.heading?.create({ level: 2 }, atom ? [atom] : []);
    if (!atom || !heading) throw new Error('schema lacks math or headings');
    const measureAtom = vi.fn(() => ({ width: 10, height: 10 }));
    createTextLayout({ template: BASE_TEMPLATE, measureAtom }).layoutText(heading, {
      width: 400,
      scope: 'appendix',
    });
    expect(measureAtom).toHaveBeenCalledWith(atom, { parent: heading, scope: 'appendix' });
  });

  it('DOCE-PAGINATION-9.5 refuses a block that holds a template variable', () => {
    const variable = documentSchema.nodes.template_variable?.create({ variableKey: 'page.total' });
    const paragraph = documentSchema.nodes.paragraph?.create(null, [
      documentSchema.text('aaaa '),
      ...(variable ? [variable] : []),
    ]);
    if (!paragraph) throw new Error('schema has no paragraph');
    expect(
      createTextLayout({ template: BASE_TEMPLATE }).layoutText(paragraph, { width: 60 }),
    ).toEqual({ ok: false, reason: 'template variable' });
  });

  it('DOCE-PAGINATION-9.6 aligns lines and pads a code block', () => {
    const centred: TemplateFile = {
      ...BASE_TEMPLATE,
      styles: {
        ...BASE_TEMPLATE.styles,
        paragraph: { ...BASE_TEMPLATE.styles?.paragraph, alignment: 'center' },
      },
    };
    expect(table(block('<p>aaaa</p>'), 60, { template: centred }).lines[0]?.left).toBe(18);
    const right: TemplateFile = {
      ...BASE_TEMPLATE,
      styles: {
        ...BASE_TEMPLATE.styles,
        paragraph: { ...BASE_TEMPLATE.styles?.paragraph, alignment: 'right' },
      },
    };
    expect(table(block('<p>aaaa</p>'), 60, { template: right }).lines[0]?.left).toBe(36);
    const code = table(block('<pre><code>aaaa</code></pre>', 'code_block'), 100);
    expect(code).toMatchObject({ width: 100, height: 14, overhead: 16 });
    expect(code.lines[0]).toMatchObject({ left: 8, width: 20 });
  });

  it('DOCE-PAGINATION-9.6 lays code out beside its gutter of line numbers', () => {
    // 10px code: a zero is 5px wide, so a gutter of three digits is 15 + 14px.
    const code = block(`<pre><code>${'a'.repeat(12)}</code></pre>`, 'code_block');
    expect(table(code, 100).lines).toHaveLength(1);
    const numbered = table(code, 100, { codeLineNumbers: true });
    expect(numbered.lines.map((line) => [line.left, line.width])).toEqual([
      [37, 55],
      [37, 5],
    ]);
    const long = `${Array.from({ length: 999 }, () => 'a').join('\n')}\n${'a'.repeat(12)}`;
    const thousand = table(block(`<pre><code>${long}</code></pre>`, 'code_block'), 100, {
      codeLineNumbers: true,
    });
    expect(thousand.lines.at(-1)?.left).toBe(8 + 34);
  });

  it('DOCE-PAGINATION-9.7 refuses a block whose font is not served', () => {
    const engine = createTextLayout({
      template: BASE_TEMPLATE,
      isFontServed: (family) => family === 'Arial',
    });
    expect(engine.layoutText(block('<p>aaaa</p>'), { width: 60 }).ok).toBe(true);
    expect(engine.layoutText(block('<p><code>aaaa</code></p>'), { width: 60 })).toEqual({
      ok: false,
      reason: 'font not served: Courier New',
    });
    expect(
      engine.layoutText(documentSchema.nodes.horizontal_rule?.create() ?? block('<p></p>'), {
        width: 60,
      }).ok,
    ).toBe(false);
  });

  it('DOCE-PAGINATION-9.7 breaks lines in the document’s language', () => {
    table(block('<p>aaaa</p>'), 60, { language: 'ja' });
    expect(pretext.locales).toEqual(['ja']);
  });

  it('DOCE-PAGINATION-9.8 measures ranges and splits a paragraph at a line start', () => {
    const lines = table(block(`<p>${WORDS} ffff gggg</p>`), 60);
    const measurement = lineTableMeasurement(lines);
    expect(measurement.measure(0, 24)).toEqual({ height: 54, lines: 3 });
    expect(measurement.measure(12, 12)).toEqual({ height: 18, lines: 1 });
    const text = `${WORDS} ffff gggg`;
    const plan = planParagraphSplit({ text, height: lines.height, fitting: 40, measurement });
    expect(plan).toEqual({ end: 20, next: 20, headHeight: 36, tailHeight: 36 });
    const tail = planParagraphSplit({
      text: text.slice(20),
      height: 36,
      fitting: 20,
      measurement: lineTableMeasurement(lines, 20),
    });
    expect(tail).toBeNull();
  });
});
