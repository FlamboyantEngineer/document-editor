import { describe, expect, it } from 'vitest';
import { clusterCount, mathTreeText } from './math-text.js';

describe('math drawn text', () => {
  it('DOCE-PAGINATION-12.9 counts the clusters math draws', () => {
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
