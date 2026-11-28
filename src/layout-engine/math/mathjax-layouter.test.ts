// @vitest-environment node
import { MathJaxStix2Font } from '@mathjax/mathjax-stix2-font/js/svg.js';
import { liteAdaptor } from '@mathjax/src/js/adaptors/liteAdaptor.js';
import { HTMLHandler } from '@mathjax/src/js/handlers/html/HTMLHandler.js';
import { mathjax } from '@mathjax/src/js/mathjax.js';
import { SVG } from '@mathjax/src/js/output/svg.js';
import { asyncLoad } from '@mathjax/src/js/util/AsyncLoad.js';
import { describe, expect, it, vi } from 'vitest';
import { fingerprintLayouts, katexTree, mathCases } from '../../../test/math-layouts.js';
import type { MathLayouter } from '../math-atoms.js';
import { createMathJaxLayouter, MATHJAX_RELEASE, mathMarkup } from './mathjax-layouter.js';

// The fingerprint DOCE-LABS-7.4 pins in a page on Linux, Windows and macOS; Node gives the same.
const LAYOUTS_FINGERPRINT = 'a68b7f24';

// Async so each test awaits it as it would a loaded layouter; MathJax loads with the first prepare.
// eslint-disable-next-line @typescript-eslint/require-await -- the layouter is made at once
async function layouter(): Promise<MathLayouter> {
  return createMathJaxLayouter();
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
    expect(one.key).toBe(`mathjax-${mathjax.version}-stix2-${MathJaxStix2Font.NAME}`);
    expect(MATHJAX_RELEASE).toBe(mathjax.version);
  });

  it('keeps the host’s loader and handlers intact while concurrent layouters load STIX2 ranges', async () => {
    const host = mathjax.handlers.register(new HTMLHandler(liteAdaptor()));
    const handlers = [...mathjax.handlers];
    const { asyncLoad: previousLoad, asyncIsSynchronous } = mathjax;
    const genericFont = Object.getOwnPropertyDescriptor(SVG, 'genericFont');
    const loaded = { host: true };
    const hostLoad = vi.fn(() => loaded);
    mathjax.asyncLoad = hostLoad;
    mathjax.asyncIsSynchronous = true;
    try {
      expect(await asyncLoad('host/start.js')).toBe(loaded);
      const [one, other] = await Promise.all([layouter(), layouter()]);
      const tree = katexTree('\\text{Ж}', false);
      const second = katexTree('\\text{Ж} + 1', false);
      await Promise.all([one.prepare([tree, second]), other.prepare([tree])]);
      expect(one.layout(tree, false, 16)).toMatchObject({ missing: '' });
      expect(one.layout(second, false, 16)).toMatchObject({ missing: '' });
      expect(other.layout(tree, false, 16)).toEqual(one.layout(tree, false, 16));
      expect(await asyncLoad('host/later.js')).toBe(loaded);
      expect(hostLoad.mock.calls).toEqual([['host/start.js'], ['host/later.js']]);
      expect(mathjax.asyncLoad).toBe(hostLoad);
      expect(mathjax.asyncIsSynchronous).toBe(true);
      expect([...mathjax.handlers]).toEqual(handlers);
      expect(Object.getOwnPropertyDescriptor(SVG, 'genericFont')).toEqual(genericFont);
    } finally {
      mathjax.asyncLoad = previousLoad;
      mathjax.asyncIsSynchronous = asyncIsSynchronous;
      for (const handler of [...mathjax.handlers]) {
        if (!handlers.includes(handler)) mathjax.handlers.unregister(handler.item);
      }
      mathjax.handlers.unregister(host);
      if (genericFont) Object.defineProperty(SVG, 'genericFont', genericFont);
      else Reflect.deleteProperty(SVG, 'genericFont');
    }
  });

  it('writes a math tree as MathML markup', () => {
    expect(mathMarkup({ tag: 'mi', attrs: { mathvariant: 'a"<' }, children: ['x<&'] })).toBe(
      '<mi mathvariant="a&quot;&lt;">x&lt;&amp;</mi>',
    );
  });
});
