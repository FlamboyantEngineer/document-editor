import { describe, expect, it } from 'vitest';
import { clusterCount, mathDrawnText, mathTreeText } from './math-text.js';

const typeset = (markup: string) => {
  const element = document.createElement('span');
  element.innerHTML = markup;
  return element;
};

describe('math drawn text', () => {
  it('DOCE-PAGINATION-12.9 reads the token elements, not the annotation, and counts clusters', () => {
    const element = typeset(
      '<math><semantics><mrow><mi>E</mi><mo>=</mo><mi>m</mi><msup><mi>c</mi><mn>2</mn></msup><mtext> </mtext></mrow><annotation encoding="application/x-tex">E = mc^2</annotation></semantics></math>',
    );
    expect(mathDrawnText(element)).toBe('E=mc2');
    expect(clusterCount('E=mc2')).toBe(5);
    expect(clusterCount('x̂')).toBe(1);
    expect(clusterCount('')).toBe(1);
  });

  it('DOCE-PAGINATION-12.9 reads a typeset tree as the drawn element', () => {
    const tree = {
      tag: 'math',
      children: [
        {
          tag: 'semantics',
          children: [
            {
              tag: 'mrow',
              children: [
                { tag: 'mi', children: ['x'] },
                { tag: 'mo', children: ['+'] },
                { tag: 'mn', children: ['1'] },
              ],
            },
            { tag: 'annotation', children: ['x+1'] },
          ],
        },
      ],
    };
    expect(mathTreeText(tree)).toBe('x+1');
  });
});
