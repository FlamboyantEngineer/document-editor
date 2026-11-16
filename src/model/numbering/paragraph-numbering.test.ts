import { describe, expect, it } from 'vitest';
import { parseMarkup } from '../../../test/document-markup.js';
import {
  advanceParagraphCounters,
  hasParagraphNumberingContent,
  hasParagraphNumberingText,
  paragraphNumberingIndentationStyle,
  paragraphNumberWidth,
  parseNumberingStyle,
  resolveParagraphLevelStyle,
} from '../index.js';

describe('paragraph numbering', () => {
  it('DOCE-NUMBERING-3.1 resolves a paragraph level format and indentation', () => {
    const config = {
      styleConfig: parseNumberingStyle('1.1.1'),
      levels: [{ format: 'a)' }, { format: 'i.', numberIndent: '5mm', textIndent: null }],
    };
    expect(resolveParagraphLevelStyle(config, 2)).toEqual({
      styleConfig: parseNumberingStyle('i.'),
      numberIndent: '5mm',
      textIndent: undefined,
    });
    expect(resolveParagraphLevelStyle(config, 1, 2).styleConfig?.levels).toEqual([
      { token: '1', separator: '' },
    ]);
  });

  it('DOCE-NUMBERING-3.2 advances the counters of a numbered paragraph', () => {
    const counters: number[] = [];
    expect(advanceParagraphCounters(counters, 1)).toEqual([1]);
    expect(advanceParagraphCounters(counters, 2)).toEqual([1, 1]);
    expect(advanceParagraphCounters(counters, 2)).toEqual([1, 2]);
    expect(advanceParagraphCounters(counters, 1)).toEqual([2]);
    expect(advanceParagraphCounters(counters, 3)).toEqual([2, 1, 1]);
    expect(advanceParagraphCounters([], 3)).toEqual([1, 1, 1]);
  });

  it('DOCE-NUMBERING-3.3 numbers only a paragraph with text or an inline atom', () => {
    const numbered = (html: string) => {
      const paragraph = parseMarkup(html).firstChild;
      return paragraph ? hasParagraphNumberingContent(paragraph) : false;
    };
    expect(hasParagraphNumberingText('\u200b \ufeff')).toBe(false);
    expect(hasParagraphNumberingText(' x ')).toBe(true);
    expect(numbered('<p>\u200b <br></p>')).toBe(false);
    expect(numbered('<p>Text</p>')).toBe(true);
    expect(
      numbered('<p><span data-mention-user-id="u1" data-mention-label="A">@A</span></p>'),
    ).toBe(true);
    expect(numbered('<p></p>')).toBe(false);
  });

  it('DOCE-NUMBERING-3.4 places the number and text of a numbered paragraph', () => {
    const place = (level: number, label = '1.') => ({ level, label });
    const indentation = 'var(--doc-paragraph-indentation, 0pt)';
    expect(paragraphNumberingIndentationStyle({ styleConfig: null }, place(1))).toBe(
      `--doc-paragraph-number-indent: calc(${indentation} + 0pt); --doc-paragraph-text-indent: calc(${indentation} + 0pt + 2.6ch);`,
    );
    expect(
      paragraphNumberingIndentationStyle(
        { styleConfig: null, numberIndent: '4mm' },
        place(3, '1.2.3.'),
      ),
    ).toBe(
      `--doc-paragraph-indentation: 40pt; --doc-paragraph-number-indent: calc(${indentation} + 4mm); --doc-paragraph-text-indent: calc(${indentation} + 4mm + 5.8ch);`,
    );
    // A text position overrides the gutter; the number then starts at its own position.
    expect(
      paragraphNumberingIndentationStyle(
        { styleConfig: null, numberIndent: '4px', textIndent: '2em' },
        place(3),
      ),
    ).toBe(
      '--doc-paragraph-indentation: 40pt; --doc-paragraph-number-indent: 4px; --doc-paragraph-text-indent: 2em;',
    );
    // A position that is not a length is not written: the style would carry its text.
    expect(
      paragraphNumberingIndentationStyle(
        { styleConfig: null, numberIndent: '4px; position: fixed', textIndent: '2em' },
        place(1),
      ),
    ).toBe('--doc-paragraph-number-indent: 0pt; --doc-paragraph-text-indent: 2em;');
  });

  it('DOCE-NUMBERING-3.5 reserves room for a longer label, wider letters taking more', () => {
    expect(paragraphNumberWidth('1.')).toBe('2.6ch');
    expect(paragraphNumberWidth('10.')).toBe('3.6ch');
    expect(paragraphNumberWidth('IV.')).toBe('4.4ch');
    expect(paragraphNumberWidth('MW.')).toBe('5.2ch');
    expect(paragraphNumberWidth('§ 1.2.1.')).toBe('8ch');
  });
});
