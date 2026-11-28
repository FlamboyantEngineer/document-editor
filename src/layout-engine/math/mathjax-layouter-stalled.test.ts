// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { katexTree } from '../../../test/math-layouts.js';
import { createMathJaxLayouter, MATH_LOAD_TIMEOUT } from './mathjax-layouter.js';

// MathJax's SVG output whose chunk never arrives, as on a stalled network request.
vi.mock('@mathjax/src/js/output/svg.js', () => new Promise(() => undefined));

describe('DOCE-PAGINATION-12.9 MathJax that never loads', () => {
  it('stops waiting after the deadline and leaves math in the reserved box', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const math = createMathJaxLayouter();
      const tree = katexTree('x^2', false);
      const pending = math.prepare([tree]);
      await vi.advanceTimersByTimeAsync(MATH_LOAD_TIMEOUT);
      await pending;
      expect(math.key).toBe('reserved-math');
      expect(math.prepare([tree])).toBeNull();
      expect(math.layout(tree, false, 16)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
