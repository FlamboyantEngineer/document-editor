import { describe, expect, it } from 'vitest';
import { variablePieces } from './variable-pieces.js';

const texts = (value: string) => variablePieces(value).map(({ text }) => text);

describe('variablePieces', () => {
  it('DOCE-PAGINATION-9.5 cuts a value into its words, each with the white space after it', () => {
    expect(variablePieces('A long  title ')).toEqual([
      { text: 'A ', side: 0 },
      { text: 'long  ', side: 2 },
      { text: 'title ', side: 4 },
    ]);
    // White space before the first word belongs to it; white space alone is one piece.
    expect(texts('  a\tb')).toEqual(['  a\t', 'b']);
    expect(texts('   ')).toEqual(['   ']);
    expect(texts('')).toEqual([]);
  });

  it('DOCE-PAGINATION-9.5 ends a piece at each line feed, an empty line its line feed alone', () => {
    expect(texts('First line\nSecond')).toEqual(['First ', 'line\n', 'Second']);
    expect(texts('a\n\nb')).toEqual(['a\n', '\n', 'b']);
    // Line feeds that end the value are left out.
    expect(texts('a\n\n')).toEqual(['a']);
  });
});
