import { describe, expect, it } from 'vitest';
import { signatureSvgMarkup } from './signature-vector.js';

const vector = {
  viewBox: { width: 200, height: 80 },
  paths: [
    { d: 'M 10 10 L 190 70', fill: false, strokeWidth: 2 },
    { d: 'M0 0h4v4z', fill: true, strokeWidth: null, transform: [2, 0, 0, 2, 5, 5] },
  ],
};

// The markup drawn in this window, so its elements are this window's.
function parse(markup: string): Element {
  const holder = document.createElement('div');
  holder.innerHTML = markup;
  const svg = holder.querySelector('svg');
  if (!svg) throw new Error('No SVG drawn');
  return svg;
}

describe('signatureSvgMarkup', () => {
  it('DOCE-EDITOR-6.23 draws a signature vector as SVG in the current colour', () => {
    const svg = parse(signatureSvgMarkup(vector, 'Ada <Admin>') ?? '');
    expect(svg).toHaveAttribute('viewBox', '0 0 200 80');
    expect(svg).toHaveAttribute('aria-label', 'Ada <Admin>');
    const paths = [...svg.querySelectorAll('path')].map((path) =>
      ['d', 'fill', 'stroke', 'stroke-width', 'transform'].map((name) => path.getAttribute(name)),
    );
    expect(paths).toEqual([
      ['M 10 10 L 190 70', 'none', 'currentColor', '2', null],
      ['M0 0h4v4z', 'currentColor', 'none', null, 'matrix(2 0 0 2 5 5)'],
    ]);
  });

  it('DOCE-EDITOR-6.23 writes nothing for a value that is not a valid signature', () => {
    expect(signatureSvgMarkup(null)).toBeNull();
    const scripted = { ...vector, paths: [{ d: 'M0 0"/><script>x()</script>', fill: true }] };
    expect(signatureSvgMarkup(scripted)).toBeNull();
  });
});
