import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { describe, expect, it, vi } from 'vitest';
import { mathOf, standInMathLayouter } from '../../test/math-layout-fixtures.js';
import type { MathTree, TypesetMath } from '../engine/math-typeset.js';
import { createDocumentSchema } from '../model/schema/document-schema.js';
import type { AtomMeasurer } from './atoms.js';
import {
  createMathAtomMeasurer,
  fitScale,
  MATH_MIN_REPORTED_SCALE,
  placeMath,
  reservedMath,
} from './math-atoms.js';

const schema = createDocumentSchema();
const inline = (latex: string) => {
  const made = schema.nodes.math_inline?.create(null, schema.text(latex));
  if (!made) throw new Error('schema has no inline math');
  return made;
};
const display = (latex: string) => {
  const made = schema.nodes.math_display?.create(null, schema.text(latex));
  if (!made) throw new Error('schema has no display math');
  return made;
};

const ready = (tokens: readonly string[], block = false): TypesetMath => ({
  state: 'ready',
  math: mathOf(tokens, block),
});

function measurer(
  typesets: Map<ProseMirrorNode, TypesetMath>,
  options: Parameters<typeof standInMathLayouter>[0] = {},
  inner: AtomMeasurer = () => ({ size: { width: 7, height: 7 } }),
) {
  const { layouter, calls } = standInMathLayouter(options);
  const missing = vi.fn<(text: string) => void>();
  const refused = vi.fn<(text: string) => void>();
  const measure = createMathAtomMeasurer({
    inner,
    layouter: () => layouter,
    typesetOf: (node) => typesets.get(node) ?? null,
    sizeOf: () => 20,
    missing,
    refused,
  });
  return { measure, calls, missing, refused };
}

describe('math atoms sized from their layout', () => {
  it('DOCE-PAGINATION-12.10 fits an equation into its room with one uniform scale, never above 1 and with no floor', () => {
    expect(fitScale(100, 200)).toBe(1);
    expect(fitScale(100, 100)).toBe(1);
    expect(fitScale(400, 100)).toBe(0.25);
    expect(fitScale(300, 100)).toBe(Math.floor((65_536 * 100) / 300) / 65_536);
    expect(fitScale(100, 0)).toBe(0);
    const laid = { math: { width: 400, ascent: 14, descent: 4, svg: mathOf([]), missing: '' } };
    const placed = placeMath(laid, 100);
    expect(placed.box).toEqual({ width: 100, ascent: 3.5, descent: 1, scale: 0.25 });
    expect(placed.end).toBe(0);
    expect(MATH_MIN_REPORTED_SCALE).toBe(0.5);
    expect(placeMath(laid, 300).box.scale).toBe(0.75);
  });

  it('DOCE-PAGINATION-12.10 fits a display equation into its line less its automatic number, or its tag where wider', () => {
    const svg = mathOf([]);
    const laid = { math: { width: 400, ascent: 14, descent: 4, svg, missing: '' } };
    const numbered = placeMath(laid, 240, 40);
    expect(numbered.box.scale).toBe(0.5);
    expect(numbered.end).toBe(40);
    // The end keeps the wider of the two, rounded up to the layout unit.
    const tag = { width: 60.001, ascent: 10, descent: 3, svg, missing: '' };
    expect(placeMath({ ...laid, tag }, 240, 40).end).toBe(60.015625);
  });

  it('DOCE-PAGINATION-12.10 fits a tagged equation into its line less the tag, which stays unscaled', () => {
    const svg = mathOf([]);
    const tag = { width: 40, ascent: 10, descent: 3, svg, missing: '' };
    const laid = { math: { width: 320, ascent: 14, descent: 4, svg, missing: '' }, tag };
    const placed = placeMath(laid, 200);
    expect(placed.box.scale).toBe(0.5);
    expect(placed.tag).toBe(tag);
    expect(placed.end).toBe(40);
  });

  it('DOCE-PAGINATION-12.10 sizes typeset math from its layout at its font size, without the DOM', () => {
    const atom = inline('ab');
    const inner = vi.fn<AtomMeasurer>(() => ({ size: { width: 7, height: 7 } }));
    const { measure, calls } = measurer(new Map([[atom, ready(['a', 'b'])]]), {}, inner);
    // Two characters at 20px: 20px wide, 14px above the baseline and 4px below.
    expect(measure(atom, 0)).toEqual({
      size: {
        width: 20,
        height: 18,
        baseline: 14,
        math: { math: expect.objectContaining({ width: 20, ascent: 14, descent: 4 }) as unknown },
      },
    });
    expect(calls).toEqual([{ text: 'ab', display: false, size: 20 }]);
    expect(inner).not.toHaveBeenCalled();
    // Other atoms, and math not typeset, are measured by the inner measurer.
    const image = schema.nodes.image?.create({
      src: 'https://example.org/a.png',
      templateImageWidth: 7,
      templateImageHeight: 7,
    });
    if (!image) throw new Error('schema has no image');
    expect(measure(image, 0)).toEqual({ size: { width: 7, height: 7 } });
    expect(measure(inline('c'), 0)).toEqual({ size: { width: 7, height: 7 } });
  });

  it('DOCE-PAGINATION-12.10 lays a display equation and its tag out apart', () => {
    const equation = display('x \\tag{1}');
    const tagged: MathTree = {
      tag: 'math',
      attrs: { display: 'block' },
      children: [
        {
          tag: 'semantics',
          attrs: {},
          children: [
            {
              tag: 'mtable',
              attrs: { width: '100%' },
              children: [
                {
                  tag: 'mtr',
                  attrs: {},
                  children: [
                    { tag: 'mtd', attrs: { width: '50%' }, children: [] },
                    {
                      tag: 'mtd',
                      attrs: {},
                      children: [{ tag: 'mi', attrs: {}, children: ['xy'] }],
                    },
                    { tag: 'mtd', attrs: { width: '50%' }, children: [] },
                    {
                      tag: 'mtd',
                      attrs: {},
                      children: [{ tag: 'mtext', attrs: {}, children: ['(1)'] }],
                    },
                  ],
                },
              ],
            },
            { tag: 'annotation', attrs: {}, children: ['x \\tag{1}'] },
          ],
        },
      ],
    };
    const { measure, calls } = measurer(new Map([[equation, { state: 'ready', math: tagged }]]));
    const size = measure(equation, 600)?.size;
    expect(calls).toEqual([
      { text: 'xy', display: true, size: 20 },
      { text: '(1)', display: false, size: 20 },
    ]);
    expect(size).toMatchObject({ width: 20 + 30, height: 18 });
    expect(size?.math?.tag?.width).toBe(30);
  });

  it('DOCE-PAGINATION-12.10 DOCE-PAGINATION-14.4 gives math the layouter refuses or has no glyphs for the reserved box, and lists it', () => {
    const missingAtom = inline('a日');
    const refusedAtom = inline('b');
    const typesets = new Map([
      [missingAtom, ready(['a', '日'])],
      [refusedAtom, { state: 'ready' as const, math: { ...mathOf(['b']), tag: 'math' } }],
    ]);
    const { measure, missing } = measurer(typesets, { missing: '日' });
    // One em per cluster, 0.8em above the baseline and 0.2em below.
    expect(measure(missingAtom, 0)?.size).toMatchObject({ width: 40, height: 20, baseline: 16 });
    expect(measure(missingAtom, 0)?.size.math?.reserved).toBe(true);
    expect(missing).toHaveBeenCalledWith('日');
    const refusing = measurer(new Map([[refusedAtom, ready(['b'])]]), { refuse: ['mi'] });
    expect(refusing.measure(refusedAtom, 0)?.size).toMatchObject({ width: 20, height: 20 });
    expect(refusing.refused).toHaveBeenCalledWith('b');
    expect(reservedMath(3, true, 10)).toMatchObject({ math: { width: 0, ascent: 20, descent: 0 } });
  });

  it('DOCE-PAGINATION-12.10 keeps math provisional while its glyphs load, then sizes it from its layout', async () => {
    const atom = inline('ab');
    let loaded = () => undefined as void;
    const loading = new Promise<void>((resolve) => {
      loaded = resolve;
    });
    const { measure } = measurer(new Map([[atom, ready(['a', 'b'])]]), { loading });
    const result = measure(atom, 0);
    expect(result?.size).toEqual({ width: 7, height: 7 });
    loaded();
    expect(await result?.settled).toMatchObject({ width: 20, height: 18, baseline: 14 });
  });

  it('DOCE-PAGINATION-12.10 sizes math typeset after it was first measured from its layout', async () => {
    const atom = inline('ab');
    const typesets = new Map<ProseMirrorNode, TypesetMath>();
    let drawn = () => undefined as void;
    const settled = new Promise<{ width: number; height: number }>((resolve) => {
      drawn = () => resolve({ width: 9, height: 9 });
    });
    const inner: AtomMeasurer = () => ({ size: { width: 7, height: 7 }, settled });
    const { measure } = measurer(typesets, {}, inner);
    const result = measure(atom, 0);
    expect(result?.size).toEqual({ width: 7, height: 7 });
    typesets.set(atom, ready(['a', 'b']));
    drawn();
    expect(await result?.settled).toMatchObject({ width: 20, height: 18 });
  });
});
