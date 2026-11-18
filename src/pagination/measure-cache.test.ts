import { describe, expect, it } from 'vitest';
import { blockMargin, margins } from './measure-cache.js';

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

describe('the margins of a table with its caption', () => {
  // A table after its caption in the node holding both, styled as given.
  function holder(style: string): HTMLElement {
    const element = document.createElement('div');
    element.className = 'doc-table-figure';
    element.setAttribute('style', style);
    element.innerHTML =
      '<div style="margin-top: 4px"></div><table style="margin-bottom: 12px"><tbody></tbody></table>';
    document.body.appendChild(element);
    return element;
  }

  it('DOCE-PAGINATION-2.2 takes the margins its caption and table pass through it, as a plain block', () => {
    expect(margins(holder('margin-bottom: 6px'))).toEqual({ marginTop: 4, marginBottom: 12 });
    // Laid out as flex, or with padding, the margins stay inside it.
    expect(margins(holder('display: flex; margin-bottom: 6px'))).toEqual({
      marginTop: 0,
      marginBottom: 6,
    });
    expect(margins(holder('padding: 1px'))).toEqual({ marginTop: 0, marginBottom: 0 });
  });
});
