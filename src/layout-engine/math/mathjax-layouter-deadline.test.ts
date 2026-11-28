// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { katexTree } from '../../../test/math-layouts.js';
import { createMathJaxLayouter, MATH_LOAD_TIMEOUT } from './mathjax-layouter.js';

// A glyph range whose chunk never arrives, as on a stalled network request.
vi.mock(
  '@mathjax/mathjax-stix2-font/js/svg/dynamic/cyrillic.js',
  () => new Promise(() => undefined),
);

afterEach(() => {
  vi.useRealTimers();
});

describe('DOCE-PAGINATION-12.12 math loads with a deadline', () => {
  it('DOCE-PAGINATION-12.9 leaves an equation whose glyph range never arrives in the reserved box', async () => {
    const math = createMathJaxLayouter();
    const plain = katexTree('x^2', false);
    await math.prepare([plain]);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const tree = katexTree('\\text{Ж}', false);
    const pending = math.prepare([tree]);
    expect(pending).toBeInstanceOf(Promise);
    await vi.advanceTimersByTimeAsync(MATH_LOAD_TIMEOUT);
    await pending;
    expect(math.prepare([tree])).toBeNull();
    expect(math.layout(tree, false, 16)).toBeNull();
    // Other math is laid out as before.
    expect(math.layout(plain, false, 16)?.width).toBeGreaterThan(0);
  });
});
