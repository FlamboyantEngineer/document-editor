import { Decoration } from 'prosemirror-view';
import { describe, expect, it } from 'vitest';
import { mathOf, standInMathLayouter } from '../../test/math-layout-fixtures.js';
import { placeMath, reservedMath } from '../layout-engine/math-atoms.js';
import { drawnMathIn, mathDrawingHooks, mathDrawingTrees } from './math-drawing.js';

const laid = (tokens: string[], size = 20) => {
  const math = standInMathLayouter().layouter.layout(mathOf(tokens), false, size);
  if (!math) throw new Error('the stand-in refused');
  return math;
};

describe('math drawn from its layout', () => {
  it('DOCE-PAGINATION-12.11 publishes the box and scale the engine placed an equation at', () => {
    const placed = placeMath({ math: laid(['a', 'b', 'c', 'd']) }, 20);
    expect(mathDrawingHooks(placed)).toEqual({
      'data-math-layout': 'laid',
      style:
        '--de-math-width: 20px; --de-math-ascent: 7px; --de-math-descent: 2px; --de-math-scale: 0.5',
    });
    const tagged = placeMath({ math: laid(['a']), tag: laid(['1', '2']) }, 600);
    expect(mathDrawingHooks(tagged).style).toContain(
      '--de-math-tag-width: 20px; --de-math-tag-ascent: 14px; --de-math-tag-descent: 4px',
    );
    expect(mathDrawingHooks(placeMath(reservedMath(2, false, 10), 600))).toMatchObject({
      'data-math-layout': 'reserved',
    });
  });

  it('DOCE-PAGINATION-12.11 draws the layout’s SVG at the box, held to the drawing’s elements and attributes', () => {
    const placed = placeMath({ math: laid(['a', 'b', 'c', 'd']), tag: laid(['1']) }, 30);
    const [drawing, tag] = mathDrawingTrees(placed);
    expect(drawing).toEqual({
      tag: 'svg',
      attrs: {
        viewBox: '0 -700 40000 900',
        class: 'de-math__drawing',
        width: '20',
        height: '9',
        'aria-hidden': 'true',
      },
      // The stand-in's handler, MathJax's data attributes and its text element are left out.
      children: [
        {
          tag: 'g',
          attrs: { fill: 'currentColor' },
          children: [
            { tag: 'rect', attrs: { x: '0', y: '0', width: '10', height: '10' }, children: [] },
          ],
        },
      ],
    });
    // The tag stays at its own size.
    expect(tag?.attrs).toMatchObject({ class: 'de-math__tag', width: '10', height: '18' });
    expect(mathDrawingTrees(placeMath(reservedMath(1, false, 10), 600))).toEqual([]);
    // A math view draws the SVG before its MathML, once the math is typeset.
    const dom = document.createElement('span');
    const drawn = drawnMathIn(dom, [Decoration.node(0, 1, {}, { mathDrawing: placed })]);
    drawn.show(document.createElement('math'));
    const [svg, , math] = dom.children;
    expect(svg?.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(svg).toHaveAttribute('viewBox', '0 -700 40000 900');
    expect(svg?.querySelector('rect')).toHaveAttribute('width', '10');
    expect(math?.tagName).toBe('MATH');
    drawn.place([]);
    expect(dom.children).toHaveLength(1);
  });
});
