// Every symbol of the Unicode blocks a document writes with, by block: letters with accents, Greek
// and Cyrillic, punctuation, currency, letterlike symbols, number forms, arrows, mathematics,
// technical symbols, shapes, symbols and dingbats. Each is named by its code point, which the
// picker's search finds it by.

import type { CharacterGridCategory } from '@flamboyantengineer/ui-components/character-grid';

/** The Unicode blocks the symbol picker offers, by their first and last code points. */
export const SYMBOL_BLOCKS: readonly (readonly [
  id: string,
  label: string,
  from: number,
  to: number,
])[] = [
  ['latin-1', 'Latin-1 supplement', 0x00a1, 0x00ff],
  ['latin-extended-a', 'Latin extended A', 0x0100, 0x017f],
  ['latin-extended-b', 'Latin extended B', 0x0180, 0x024f],
  ['greek-coptic', 'Greek and Coptic', 0x0370, 0x03ff],
  ['cyrillic', 'Cyrillic', 0x0400, 0x04ff],
  ['punctuation', 'General punctuation', 0x2010, 0x205e],
  ['scripts', 'Superscripts and subscripts', 0x2070, 0x209c],
  ['currency', 'Currency symbols', 0x20a0, 0x20c0],
  ['letterlike', 'Letterlike symbols', 0x2100, 0x214f],
  ['number-forms', 'Number forms', 0x2150, 0x218b],
  ['arrows-block', 'Arrows', 0x2190, 0x21ff],
  ['operators', 'Mathematical operators', 0x2200, 0x22ff],
  ['technical', 'Miscellaneous technical', 0x2300, 0x23ff],
  ['enclosed', 'Enclosed alphanumerics', 0x2460, 0x24ff],
  ['box-drawing', 'Box drawing', 0x2500, 0x257f],
  ['block-elements', 'Block elements', 0x2580, 0x259f],
  ['shapes', 'Geometric shapes', 0x25a0, 0x25ff],
  ['symbols', 'Miscellaneous symbols', 0x2600, 0x26ff],
  ['dingbats', 'Dingbats', 0x2700, 0x27bf],
  ['math-a', 'Miscellaneous mathematical symbols A', 0x27c0, 0x27ef],
  ['arrows-a', 'Supplemental arrows A', 0x27f0, 0x27ff],
  ['arrows-b', 'Supplemental arrows B', 0x2900, 0x297f],
  ['math-b', 'Miscellaneous mathematical symbols B', 0x2980, 0x29ff],
  ['operators-supplement', 'Supplemental mathematical operators', 0x2a00, 0x2aff],
  ['symbols-arrows', 'Miscellaneous symbols and arrows', 0x2b00, 0x2bff],
];

// A character a writer inserts: a letter, number, punctuation or symbol, never a mark, a control
// or a code point no character holds.
const INSERTABLE = /^[\p{L}\p{N}\p{P}\p{S}]$/u;

/** A character's code point in Unicode notation, such as `U+00A9`. */
export const codePointName = (char: string) =>
  `U+${(char.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}`;

/** The symbols of each block, named by their code point unless `names` names them. */
export function symbolBlocks(
  names: ReadonlyMap<string, string> = new Map(),
): CharacterGridCategory[] {
  return SYMBOL_BLOCKS.map(([id, label, from, to]) => {
    const characters = [];
    for (let code = from; code <= to; code += 1) {
      const char = String.fromCodePoint(code);
      if (!INSERTABLE.test(char)) continue;
      const point = codePointName(char);
      const name = names.get(char);
      characters.push({ char, name: name ? `${name} ${point}` : point });
    }
    return { id, label, characters };
  });
}
