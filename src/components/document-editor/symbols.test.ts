import { describe, expect, it } from 'vitest';
import { codePointName, SYMBOL_BLOCKS, symbolBlocks } from './symbol-blocks.js';
import { COMMON_SYMBOLS, DEFAULT_SYMBOLS } from './symbols.js';

describe('symbols', () => {
  it('DOCE-EDITOR-4.5 offers the common symbols by name, then every symbol of each block', () => {
    expect(DEFAULT_SYMBOLS.slice(0, COMMON_SYMBOLS.length)).toEqual(COMMON_SYMBOLS);
    expect(DEFAULT_SYMBOLS).toHaveLength(COMMON_SYMBOLS.length + SYMBOL_BLOCKS.length);
    const ids = DEFAULT_SYMBOLS.map((category) => category.id);
    expect(new Set(ids).size).toBe(ids.length);
    const operators = symbolBlocks().find((block) => block.id === 'operators');
    expect(operators?.characters).toHaveLength(256);
    expect(operators?.characters[0]).toEqual({ char: '∀', name: 'U+2200' });
    // A named common symbol keeps its name, with its code point.
    const latin = DEFAULT_SYMBOLS.find((block) => block.id === 'latin-1');
    expect(latin?.characters.find((each) => each.char === '§')?.name).toBe('Section sign U+00A7');
    // No mark, control or unassigned code point.
    expect(latin?.characters.some((each) => each.char === '­')).toBe(false);
    expect(codePointName('Ω')).toBe('U+03A9');
  });
});
