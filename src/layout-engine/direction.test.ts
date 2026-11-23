import { describe, expect, it } from 'vitest';
import { findNode, parseMarkup } from '../../test/document-markup.js';
import { blockDirection } from './direction.js';

const direction = (markup: string) => {
  const node = findNode(parseMarkup(markup), 'paragraph');
  if (!node) throw new Error(`no paragraph in ${markup}`);
  return blockDirection(node);
};

describe('blockDirection', () => {
  it('DOCE-PAGINATION-9.12 takes a block’s direction from its first strong character', () => {
    expect(direction('<p>שלום world</p>')).toBe('rtl');
    expect(direction('<p>مرحبا بالعالم</p>')).toBe('rtl');
    expect(direction('<p>hello מילה</p>')).toBe('ltr');
    expect(direction('<p>中文 עברית</p>')).toBe('ltr');
  });

  it('DOCE-PAGINATION-9.12 passes over digits, punctuation, spaces and marks', () => {
    expect(direction('<p>2026, (١٢٣) — ספר</p>')).toBe('rtl');
    expect(direction('<p>123 ... ok</p>')).toBe('ltr');
    expect(direction('<p>ًّ כתב</p>')).toBe('rtl');
  });

  it('DOCE-PAGINATION-9.12 reads its marks too, and is left to right without a strong character', () => {
    expect(direction('<p>‏12 abc</p>')).toBe('rtl');
    expect(direction('<p>‎12 אבג</p>')).toBe('ltr');
    expect(direction('<p>123 !?</p>')).toBe('ltr');
    expect(direction('<p></p>')).toBe('ltr');
  });

  it('DOCE-PAGINATION-9.12 reads the text a mention shows', () => {
    const markup = '<p><span data-type="mention" data-id="u1" data-label="דנה">@דנה</span> hi</p>';
    expect(direction(markup)).toBe('rtl');
  });
});
