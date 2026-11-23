import { describe, expect, it } from 'vitest';
import { findNode, parseMarkup } from '../../test/document-markup.js';
import { UNICODE_VERSION } from './bidi-classes.js';
import { blockDirection, strongDirection } from './direction.js';

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

  it('DOCE-PAGINATION-9.12 decides by Bidi_Class, as Chromium’s dir="auto" does, not by script or letter', () => {
    // A Roman numeral is a number, not a letter, but strongly left to right.
    expect(direction('<p>\u2162 שלום</p>')).toBe('ltr');
    // The Arabic tatweel belongs to no script of its own, but is of class AL.
    expect(direction('<p>\u0640abc</p>')).toBe('rtl');
    // Isolates are read through, as dir="auto" reads them.
    expect(direction('<p>\u2067abc\u2069 א</p>')).toBe('ltr');
    // An unassigned code point of a right-to-left block takes its block's default class.
    expect(direction('<p>\u05ff abc</p>')).toBe('rtl');
    // Letterlike symbols of class L or neutral, and an Arabic number, which is not strong.
    expect(direction('<p>\u2122 אבג</p>')).toBe('rtl');
    expect(direction('<p>\u212b אבג</p>')).toBe('ltr');
    expect(direction('<p>\u0660 abc</p>')).toBe('ltr');
  });

  it('DOCE-PAGINATION-9.12 reads every code point’s class from Unicode’s table', () => {
    expect(UNICODE_VERSION).toBe('17.0.0');
    const classes = (from: number, to: number) =>
      Array.from({ length: to - from + 1 }, (_, index) => strongDirection(from + index));
    expect(classes(0x40, 0x42)).toEqual([null, 'ltr', 'ltr']);
    expect(classes(0x5cf, 0x5d0)).toEqual(['rtl', 'rtl']);
    expect(classes(0x1f600, 0x1f600)).toEqual([null]);
    expect(classes(0x10ffff, 0x10ffff)).toEqual([null]);
    expect(classes(0x10fffd, 0x10fffd)).toEqual(['ltr']);
    expect(classes(0x1e900, 0x1e900)).toEqual(['rtl']);
  });

  it('DOCE-PAGINATION-9.12 reads the text a mention shows', () => {
    const markup = '<p><span data-type="mention" data-id="u1" data-label="דנה">@דנה</span> hi</p>';
    expect(direction(markup)).toBe('rtl');
  });
});
