import { describe, expect, it } from 'vitest';
import { blockMargin } from './measure-cache.js';

// A computed style with a writing mode and its physical and logical block margins.
const style = (writingMode: string) =>
  ({
    writingMode,
    marginTop: '1px',
    marginBottom: '2px',
    getPropertyValue: (name: string) => (name === 'margin-block-start' ? '7px' : '9px'),
  }) as unknown as CSSStyleDeclaration;

describe('block margins', () => {
  it('DOCE-PAGINATION-2.2 reads the margins at the start and end of the block axis', () => {
    expect([blockMargin(style('horizontal-tb'), 'start'), blockMargin(style(''), 'end')]).toEqual([
      '1px',
      '2px',
    ]);
    expect([
      blockMargin(style('vertical-rl'), 'start'),
      blockMargin(style('sideways-lr'), 'end'),
    ]).toEqual(['7px', '9px']);
    expect(blockMargin(undefined, 'start')).toBe('');
  });
});
