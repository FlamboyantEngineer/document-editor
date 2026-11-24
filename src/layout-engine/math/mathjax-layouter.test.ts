// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { fingerprintLayouts, katexTree, mathCases } from '../../../test/math-layouts.js';
import type { MathLayouter } from '../math-atoms.js';
import { createMathJaxLayouter, mathMarkup } from './mathjax-layouter.js';

// The fingerprint DOCE-LABS-7.4 pins in a page on Linux, Windows and macOS; Node gives the same.
const LAYOUTS_FINGERPRINT = '12f43504';

async function layouter(): Promise<MathLayouter> {
  const created = await createMathJaxLayouter();
  if (!created) throw new Error('MathJax is not installed');
  return created;
}

const elements = (tree: { tag: string; children: readonly unknown[] }): string[] => [
  tree.tag,
  ...tree.children.flatMap((child) =>
    typeof child === 'string' ? [] : elements(child as typeof tree),
  ),
];

describe('DOCE-PAGINATION-12.12 equations laid out and drawn by MathJax', () => {
  it('lays every equation out to the recorded fingerprint', async () => {
    expect(await fingerprintLayouts(await layouter())).toBe(LAYOUTS_FINGERPRINT);
  });

  it('gives a box in pixels from the drawing’s view box, and a drawing of paths and rules', async () => {
    const math = await layouter();
    const tree = katexTree('\\frac{1}{1 + \\frac{1}{x}}', true);
    await math.prepare([tree]);
    const laid = math.layout(tree, true, 16);
    if (!laid) throw new Error('not laid out');
    const [, minY, width, height] = (laid.svg.attrs.viewBox ?? '').split(' ').map(Number);
    expect(laid.width).toBe(Math.ceil((((width ?? 0) * 16) / 1000) * 64) / 64);
    expect(laid.ascent).toBe(Math.ceil(((-(minY ?? 0) * 16) / 1000) * 64) / 64);
    expect(laid.descent).toBe(Math.ceil(((((height ?? 0) + (minY ?? 0)) * 16) / 1000) * 64) / 64);
    expect(laid.ascent + laid.descent).toBeGreaterThan(30);
    expect(new Set(elements(laid.svg))).toEqual(new Set(['svg', 'g', 'path', 'rect']));
    expect(laid.svg.attrs).toEqual({ viewBox: laid.svg.attrs.viewBox, overflow: 'visible' });
    expect(laid.missing).toBe('');
    // Twice the size, twice the box, each rounded once: one layout per equation.
    expect(math.layout(tree, true, 32)?.width).toBe(
      Math.ceil((((width ?? 0) * 32) / 1000) * 64) / 64,
    );
    // Laid out once, nothing is left to load.
    expect(math.prepare([tree])).toBeNull();
  });

  it('names the characters it has no glyph for', async () => {
    const math = await layouter();
    const tree = katexTree('\\text{日本} x', false);
    await math.prepare([tree]);
    expect(math.layout(tree, false, 16)?.missing).toBe('日本');
    expect(elements(math.layout(tree, false, 16)?.svg ?? { tag: '', children: [] })).not.toContain(
      'text',
    );
  });

  it('lays nothing out for MathML it refuses', async () => {
    const math = await layouter();
    const tree = { tag: 'math', attrs: {}, children: [{ tag: 'mfrac', attrs: {}, children: [] }] };
    await math.prepare([tree]);
    expect(math.layout(tree, false, 16)).toBeNull();
  });

  it('gives the same layout from two layouters', async () => {
    const [one, other] = await Promise.all([layouter(), layouter()]);
    const cases = mathCases().slice(0, 12);
    await one.prepare(cases.map(({ tree }) => tree));
    await other.prepare(cases.map(({ tree }) => tree));
    for (const { tree, display } of cases)
      expect(other.layout(tree, display, 13)).toEqual(one.layout(tree, display, 13));
    expect(one.key).toMatch(/^mathjax-4\.\d+\.\d+-stix2-/u);
  });

  it('writes a math tree as MathML markup', () => {
    expect(mathMarkup({ tag: 'mi', attrs: { mathvariant: 'a"<' }, children: ['x<&'] })).toBe(
      '<mi mathvariant="a&quot;&lt;">x&lt;&amp;</mi>',
    );
  });
});
