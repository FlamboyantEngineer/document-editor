import { describe, expect, it } from 'vitest';
import { mathOf } from '../../test/math-layout-fixtures.js';
import type { MathTree } from '../engine/math-typeset.js';
import { splitTag } from './math-tags.js';

const element = (tag: string, children: (MathTree | string)[] = [], attrs = {}): MathTree => ({
  tag,
  attrs,
  children,
});

describe('display equation tags', () => {
  it('DOCE-PAGINATION-12.10 takes a tag apart from its equation, as KaTeX and MathML draw it', () => {
    const katex = element(
      'math',
      [
        element('semantics', [
          element(
            'mtable',
            [
              element('mtr', [
                element('mtd', [], { width: '50%' }),
                element('mtd', [element('mi', ['E'])]),
                element('mtd', [], { width: '50%' }),
                element('mtd', [element('mtext', ['(3)'])]),
              ]),
            ],
            { width: '100%' },
          ),
          element('annotation', ['E \\tag{3}']),
        ]),
      ],
      { display: 'block' },
    );
    expect(splitTag(katex)).toEqual({
      math: element('math', [element('mrow', [element('mi', ['E'])])], { display: 'block' }),
      tag: element('math', [element('mrow', [element('mtext', ['(3)'])])], { display: 'inline' }),
    });
    const labelled = element('math', [
      element('mtable', [
        element('mlabeledtr', [element('mtd', [element('mtext', ['(4)'])]), element('mtd', ['x'])]),
      ]),
    ]);
    expect(splitTag(labelled).tag).toEqual(
      element('math', [element('mrow', [element('mtext', ['(4)'])])], { display: 'inline' }),
    );
  });

  it('DOCE-PAGINATION-12.10 leaves an equation without a tag, and a real table, whole', () => {
    const plain = mathOf(['x'], true);
    expect(splitTag(plain)).toEqual({ math: plain, tag: null });
    const matrix = element('math', [
      element('mtable', [
        element('mtr', [element('mtd', ['a']), element('mtd', ['b'])]),
        element('mtr', [element('mtd', ['c']), element('mtd', ['d'])]),
      ]),
    ]);
    expect(splitTag(matrix).tag).toBeNull();
  });
});
