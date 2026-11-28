// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { katexTree } from '../../../test/math-layouts.js';
import { createMathJaxLayouter } from './mathjax-layouter.js';

// A chunk of MathJax's that fails to load, as on a network error.
vi.mock('@mathjax/src/js/output/svg.js', () => {
  throw new Error('chunk failed to load');
});

describe('DOCE-PAGINATION-12.9 MathJax that cannot load', () => {
  it('leaves math in the reserved box, under the reserved key', async () => {
    const math = createMathJaxLayouter();
    const tree = katexTree('x^2', false);
    await math.prepare([tree]);
    expect(math.key).toBe('reserved-math');
    expect(math.prepare([tree])).toBeNull();
    expect(math.layout(tree, false, 16)).toBeNull();
  });
});
