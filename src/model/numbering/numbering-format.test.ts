import { describe, expect, it } from 'vitest';
import {
  canOmitObjectContextLevel,
  DOCUMENT_COUNTER_STYLE_CSS,
  formatCounterValue,
  formatRoman,
  mergeSectionObjectStyle,
  normalizeNumberingPattern,
  OBJECT_CONTEXT_COUNTER_STYLE_CSS,
  parseNumberingStyle,
  parseRoman,
  resolveCounterStyleToken,
  resolveCssCounterStyleToken,
  resolveObjectContextCounterStyle,
  resolveObjectContextSeparatorCounterStyle,
  ROMAN_COUNTER_STYLE_CSS,
} from '../index.js';

describe('numbering formats', () => {
  it('DOCE-NUMBERING-1.1 reads one level per character with the text after it', () => {
    expect(parseNumberingStyle('1.a)')).toEqual({
      levels: [
        { token: '1', separator: '.' },
        { token: 'a', separator: ')' },
      ],
      trailingSeparator: ')',
      hasTrailingSeparator: true,
    });
    expect(parseNumberingStyle('IA').levels.map((level) => level.token)).toEqual(['I', 'A']);
    expect(parseNumberingStyle('').levels).toEqual([{ token: '1', separator: '' }]);
  });

  it('DOCE-NUMBERING-1.1 reads a list style name as its one-level format', () => {
    expect(normalizeNumberingPattern('upper-roman')).toBe('I.');
    expect(normalizeNumberingPattern(' lower-latin ')).toBe('a.');
    expect(normalizeNumberingPattern('1-1')).toBe('1-1');
    expect(parseNumberingStyle('decimal').trailingSeparator).toBe('.');
  });

  it('DOCE-NUMBERING-1.2 names a counter style for each format character', () => {
    expect(resolveCounterStyleToken('1')).toBe('decimal');
    expect(resolveCounterStyleToken('a')).toBe('lower-alpha');
    expect(resolveCounterStyleToken('A')).toBe('upper-alpha');
    expect(resolveCounterStyleToken('I')).toBe('upper-roman');
    expect(resolveCounterStyleToken('i')).toBe('lower-roman');
    expect(resolveCounterStyleToken('R')).toBe('upper-roman');
    expect(resolveCounterStyleToken('old-upper-roman')).toBe('upper-roman');
    expect(resolveCounterStyleToken('?')).toBe('decimal');
    expect(resolveCssCounterStyleToken('i')).toBe('de-lower-roman');
    expect(resolveCssCounterStyleToken('a')).toBe('lower-alpha');
  });

  it('DOCE-NUMBERING-1.3 writes and reads roman numerals past 3999', () => {
    expect(formatRoman(4000)).toBe('MMMM');
    expect(formatRoman(1994, 'lower')).toBe('mcmxciv');
    expect(() => formatRoman(0)).toThrow(RangeError);
    expect(parseRoman('MCMXCIV')).toBe(1994);
    expect(parseRoman('MMMM')).toBe(4000);
    expect(parseRoman('IIII')).toBeNull();
    expect(parseRoman('Mi')).toBeNull();
    expect(parseRoman(4)).toBeNull();
  });

  it('DOCE-NUMBERING-1.4 prints a counter in a format character style', () => {
    expect(formatCounterValue(27, 'A')).toBe('AA');
    expect(formatCounterValue(3, 'i')).toBe('iii');
    expect(formatCounterValue('12', '1')).toBe('12');
    expect(formatCounterValue('x', '1')).toBe('1');
    expect(formatCounterValue(0, 'a')).toBe('a');
  });

  it('DOCE-NUMBERING-1.5 defines the counter styles the numbering CSS uses', () => {
    expect(ROMAN_COUNTER_STYLE_CSS).toContain('@counter-style de-upper-roman');
    expect(ROMAN_COUNTER_STYLE_CSS).toContain('@counter-style de-lower-roman');
    expect(ROMAN_COUNTER_STYLE_CSS).toContain('range: 1 infinite');
    expect(resolveObjectContextCounterStyle('de-upper-roman')).toBe('de-context-upper-roman');
    expect(resolveObjectContextCounterStyle('decimal')).toBe('de-context-decimal');
    expect(OBJECT_CONTEXT_COUNTER_STYLE_CSS).toContain('@counter-style de-context-upper-roman');
    expect(resolveObjectContextSeparatorCounterStyle('.')).toBe('de-context-separator-dot');
    expect(resolveObjectContextSeparatorCounterStyle('§')).toBeNull();
    expect(canOmitObjectContextLevel('')).toBe(true);
    expect(canOmitObjectContextLevel('-')).toBe(true);
    expect(canOmitObjectContextLevel('§')).toBe(false);
    expect(DOCUMENT_COUNTER_STYLE_CSS).toBe(
      `${ROMAN_COUNTER_STYLE_CSS}\n${OBJECT_CONTEXT_COUNTER_STYLE_CSS}`,
    );
  });

  it('DOCE-NUMBERING-1.6 lets a section format override the document format unless blank', () => {
    expect(
      mergeSectionObjectStyle({ numberingStyle: '1.', label: 'Table' }, { numberingStyle: ' ' }),
    ).toEqual({ numberingStyle: '1.', label: 'Table' });
    expect(
      mergeSectionObjectStyle({ numberingStyle: '1.' }, { numberingStyle: 'A-1', label: 'Annex' }),
    ).toEqual({ numberingStyle: 'A-1', label: 'Annex' });
    expect(mergeSectionObjectStyle(null, undefined)).toEqual({});
  });
});
