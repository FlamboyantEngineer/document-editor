// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { katexTree } from '../../../test/math-layouts.js';

// How many times MathJax's SVG output was imported.
const output = vi.hoisted(() => ({ imports: 0 }));

vi.mock('@mathjax/src/js/output/svg.js', async (original) => {
  output.imports += 1;
  return original();
});

beforeEach(() => {
  vi.resetModules();
});

const fresh = async () => (await import('./mathjax-layouter.js')).createMathJaxLayouter();

describe('DOCE-PAGINATION-12.12 MathJax loaded with the first equation', () => {
  it('loads nothing for a document without math', async () => {
    const math = await fresh();
    expect(math.prepare([])).toBeNull();
    expect(math.key).toMatch(/^mathjax-/u);
    await Promise.resolve();
    expect(output.imports).toBe(0);
  });

  it('is pending until MathJax has loaded, then lays the equation out', async () => {
    const math = await fresh();
    const tree = katexTree('\\frac{a}{b}', true);
    expect(math.layout(tree, true, 16)).toBeNull();
    const pending = math.prepare([tree]);
    expect(pending).toBeInstanceOf(Promise);
    await pending;
    expect(output.imports).toBe(1);
    expect(math.layout(tree, true, 16)?.width).toBeGreaterThan(0);
    expect(math.prepare([tree])).toBeNull();
  });
});
