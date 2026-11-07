import { describe, expect, it } from 'vitest';
import {
  buildHeadingCounterContent,
  buildObjectCounterContent,
  buildParagraphCounterContent,
  escapeCssContent,
  parseNumberingStyle,
  resolveParagraphNumberingConfig,
} from '../index.js';

describe('document numbering content', () => {
  it('DOCE-NUMBERING-2.1 numbers a heading with one counter per level down to its own', () => {
    const format = parseNumberingStyle('1.1.1');
    expect(buildHeadingCounterContent(format, 2)).toEqual({
      enabled: true,
      content: 'counter(h1, decimal) "." counter(h2, decimal) " "',
    });
    expect(buildHeadingCounterContent(format, 4)).toEqual({ enabled: false, content: '""' });
    expect(
      buildHeadingCounterContent(parseNumberingStyle('I.'), 1, { prefix: 'Part ', suffix: ':' })
        .content,
    ).toBe('"Part " counter(h1, de-upper-roman) "." ":" " "');
  });

  it('DOCE-NUMBERING-2.2 numbers a paragraph with its format last level and affixes', () => {
    expect(
      buildParagraphCounterContent(parseNumberingStyle('1.a)'), { prefix: 'P', suffix: ':' }),
    ).toEqual({
      enabled: true,
      content: '"P" ")" counter(paragraph, lower-alpha) ")" ":" " "',
    });
    expect(buildParagraphCounterContent(null)).toEqual({ enabled: false, content: '""' });
  });

  it('DOCE-NUMBERING-2.3 numbers an object under the headings it sits under', () => {
    expect(buildObjectCounterContent(parseNumberingStyle('1.1'), 'table')).toBe(
      'counter(h1, de-context-decimal) counter(h1, de-context-separator-dot) counter(table, decimal) " "',
    );
    expect(
      buildObjectCounterContent(parseNumberingStyle('1-1.'), 'figure', {
        captionLabel: true,
        headingNumbering: [parseNumberingStyle('I.')],
      }),
    ).toBe(
      'counter(h1, de-context-upper-roman) counter(h1, de-context-separator-hyphen) counter(figure, decimal)',
    );
    expect(buildObjectCounterContent(parseNumberingStyle('1§1'), 'table', { prefix: 'T' })).toBe(
      '"T" counter(h1, decimal) "§" counter(table, decimal) " "',
    );
  });

  it('DOCE-NUMBERING-2.4 escapes authored text for a quoted CSS string in a style element', () => {
    expect(escapeCssContent('a"b\\c\n</style>')).toBe('a\\"b\\\\c\\A \\3C /style\\3E ');
    expect(escapeCssContent(null)).toBe('');
    expect(escapeCssContent(7)).toBe('7');
  });

  it('DOCE-NUMBERING-2.5 inherits what a paragraph style does not set', () => {
    const inherited = resolveParagraphNumberingConfig({
      numberingStyle: '1.',
      prefix: 'P',
      numberingLevels: [{ numberingStyle: 'a)' }],
    });
    expect(inherited?.styleConfig?.levels).toEqual([{ token: '1', separator: '.' }]);
    const child = resolveParagraphNumberingConfig({ suffix: ')' }, inherited);
    expect(child).toMatchObject({ prefix: 'P', suffix: ')', styleConfig: inherited?.styleConfig });
    expect(child?.numberingLevels).toBe(inherited?.numberingLevels);
    expect(resolveParagraphNumberingConfig({ numberingStyle: '' }, inherited)?.styleConfig).toEqual(
      { levels: [], trailingSeparator: '', hasTrailingSeparator: false },
    );
    expect(resolveParagraphNumberingConfig(null, inherited)).toBe(inherited);
  });
});
