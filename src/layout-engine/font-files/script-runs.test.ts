// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { scriptRuns } from './script-runs.js';

const runs = (text: string) =>
  scriptRuns(text).map(({ start, end, script, rtl }) => [text.slice(start, end), script, rtl]);

describe('DOCE-PAGINATION-12.2 script runs as Blink shapes them', () => {
  it('puts digits, spaces and punctuation in the run of the letters before them, numbers left to right', () => {
    expect(runs('שלום 123, עולם')).toEqual([
      ['שלום ', 'Hebr', true],
      ['123', 'Hebr', false],
      [', עולם', 'Hebr', true],
    ]);
  });

  it('gives the characters that start a text the script of the letters after them', () => {
    expect(runs('12 مرحبا')).toEqual([
      ['12', 'Arab', false],
      [' مرحبا', 'Arab', true],
    ]);
  });

  it('takes a closing bracket back to the run its opening bracket is in', () => {
    expect(runs('שלום (test) x')).toEqual([
      ['שלום (', 'Hebr', true],
      ['test', 'Latn', false],
      [') ', 'Hebr', true],
      ['x', 'Latn', false],
    ]);
  });

  it('keeps a text of no script in one run of none', () => {
    expect(runs('123 (45)')).toEqual([['123 (45)', null, false]]);
  });

  it('keeps ideographs, hiragana and katakana apart, with punctuation joining by its extensions', () => {
    expect(runs('日本語のテキスト。')).toEqual([
      ['日本語', 'Hani', false],
      ['の', 'Hira', false],
      ['テキスト。', 'Kana', false],
    ]);
  });
});
