// A stand-in math layouter for tests: every identifier, number or operator 10 em-hundredths wide per
// character at the size, rising 0.7 em and falling 0.2 em, drawn as one rect per token, so sizes and
// drawings are easy to predict. What MathJax computes is tested by its own layouter.

import type { MathTree } from '../src/engine/math-typeset.js';
import type { LaidMath, MathLayouter } from '../src/layout-engine/math-atoms.js';
import { mathTreeText } from '../src/utils/math-text.js';

interface StandInOptions {
  /** Characters the stand-in has no glyph for. */
  readonly missing?: string;
  /** Tags of elements it refuses. */
  readonly refuse?: readonly string[];
  /** What `prepare` loads first, until the promise it returns settles. */
  readonly loading?: Promise<void> | null;
}

const holds = (tree: MathTree, tags: readonly string[]): boolean =>
  tags.includes(tree.tag) ||
  tree.children.some((child) => typeof child !== 'string' && holds(child, tags));

/** A math tree of tokens, as the math views keep typeset math. */
export function mathOf(tokens: readonly string[], display = false): MathTree {
  return {
    tag: 'math',
    attrs: display ? { display: 'block' } : {},
    children: [
      {
        tag: 'mrow',
        attrs: {},
        children: tokens.map((token) => ({ tag: 'mi', attrs: {}, children: [token] })),
      },
    ],
  };
}

/** The stand-in layouter, with the calls it was asked. */
export function standInMathLayouter(options: StandInOptions = {}) {
  const calls: { text: string; display: boolean; size: number }[] = [];
  // What `prepare` still loads: nothing once its promise has settled.
  let loading = options.loading ?? null;
  void loading?.then(() => {
    loading = null;
  });
  const layouter: MathLayouter = {
    key: 'stand-in',
    prepare: () => loading,
    layout(tree, display, size): LaidMath | null {
      const text = mathTreeText(tree);
      calls.push({ text, display, size });
      if (holds(tree, options.refuse ?? [])) return null;
      const width = text.length * size * 0.5;
      const missing = [...text].filter((character) => options.missing?.includes(character));
      return {
        width,
        ascent: 0.7 * size,
        descent: 0.2 * size,
        missing: missing.join(''),
        svg: {
          tag: 'svg',
          attrs: { viewBox: `0 ${String(-700)} ${String(width * 1000)} 900`, onclick: 'x()' },
          children: [
            {
              tag: 'g',
              attrs: { fill: 'currentColor', 'data-mml-node': 'mi' },
              children: [
                { tag: 'rect', attrs: { x: '0', y: '0', width: '10', height: '10' }, children: [] },
                { tag: 'text', attrs: {}, children: ['x'] },
              ],
            },
          ],
        },
      };
    },
  };
  return { layouter, calls };
}
