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

describe('the margins that pass through any block', () => {
  function block(html: string, style = ''): HTMLElement {
    const element = document.createElement('section');
    element.setAttribute('style', style);
    element.innerHTML = html;
    document.body.appendChild(element);
    return element;
  }

  it('DOCE-PAGINATION-2.2 takes its output’s paragraph margins through a script block and its output', () => {
    const script = block(
      '<div><p style="margin: 3px 0 8px">One</p><p style="margin: 0 0 8px">Two</p></div>',
    );
    expect(margins(script)).toEqual({ marginTop: 3, marginBottom: 8 });
    expect(margins(block(script.innerHTML, 'padding-bottom: 1px'))).toEqual({
      marginTop: 3,
      marginBottom: 0,
    });
    // A block that starts its own formatting context keeps them.
    for (const own of ['overflow: hidden', 'display: flow-root', 'contain: paint']) {
      expect(margins(block(script.innerHTML, own))).toEqual({ marginTop: 0, marginBottom: 0 });
    }
  });

  it('DOCE-PAGINATION-2.2 skips children out of its flow, hidden or inline at its edges', () => {
    const html =
      '<p style="display: none; margin: 20px"></p><p style="margin: 5px"></p>' +
      '<span style="position: absolute; display: block; margin: 20px"></span>';
    expect(margins(block(html))).toEqual({ marginTop: 5, marginBottom: 5 });
    expect(margins(block('<b style="margin: 9px">x</b>'))).toEqual({
      marginTop: 0,
      marginBottom: 0,
    });
  });
});
