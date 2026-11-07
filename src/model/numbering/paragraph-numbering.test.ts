import { describe, expect, it } from 'vitest';
import { parseMarkup } from '../../../test/document-markup.js';
import {
  advanceParagraphCounters,
  hasParagraphNumberingContent,
  hasParagraphNumberingText,
  paragraphNumberingIndentationStyle,
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

  it('DOCE-NUMBERING-3.4 indents a numbered paragraph by its level', () => {
    expect(paragraphNumberingIndentationStyle({ styleConfig: null }, 1)).toBe('');
    expect(paragraphNumberingIndentationStyle({ styleConfig: null }, 3)).toBe(
      '--doc-paragraph-indentation: 40pt;',
    );
    expect(
      paragraphNumberingIndentationStyle(
        { styleConfig: null, numberIndent: '4px', textIndent: '2em' },
        3,
      ),
    ).toBe(
      '--doc-paragraph-indentation: 40pt; --doc-paragraph-number-indent: 4px; --doc-paragraph-text-indent: 2em;',
    );
  });
});
