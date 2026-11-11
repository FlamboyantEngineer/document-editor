// The special characters the symbol picker offers by default: the common ones by name, by
// category, then every symbol of the blocks a document writes with.

import type { CharacterGridCategory } from '@flamboyantengineer/ui-components/character-grid';
import { symbolBlocks } from './symbol-blocks.js';

const category = (
  id: string,
  label: string,
  characters: readonly (readonly [string, string])[],
): CharacterGridCategory => ({
  id,
  label,
  characters: characters.map(([char, name]) => ({ char, name })),
});

/** The common characters, by name: typography, mathematics, Greek, arrows and units. */
export const COMMON_SYMBOLS: readonly CharacterGridCategory[] = [
  category('typography', 'Typography', [
    ['—', 'Em dash'],
    ['–', 'En dash'],
    ['…', 'Ellipsis'],
    ['“', 'Left double quotation mark'],
    ['”', 'Right double quotation mark'],
    ['‘', 'Left single quotation mark'],
    ['’', 'Right single quotation mark'],
    ['«', 'Left guillemet'],
    ['»', 'Right guillemet'],
    ['§', 'Section sign'],
    ['¶', 'Pilcrow'],
    ['†', 'Dagger'],
    ['‡', 'Double dagger'],
    ['•', 'Bullet'],
    ['©', 'Copyright sign'],
    ['®', 'Registered sign'],
    ['™', 'Trade mark sign'],
    [' ', 'No-break space'],
  ]),
  category('math', 'Mathematics', [
    ['±', 'Plus-minus sign'],
    ['×', 'Multiplication sign'],
    ['÷', 'Division sign'],
    ['≠', 'Not equal to'],
    ['≈', 'Almost equal to'],
    ['≤', 'Less-than or equal to'],
    ['≥', 'Greater-than or equal to'],
    ['∞', 'Infinity'],
    ['√', 'Square root'],
    ['∑', 'N-ary summation'],
    ['∏', 'N-ary product'],
    ['∫', 'Integral'],
    ['∂', 'Partial differential'],
    ['∆', 'Increment'],
    ['∇', 'Nabla'],
    ['∈', 'Element of'],
    ['∀', 'For all'],
    ['∃', 'There exists'],
    ['⊂', 'Subset of'],
    ['∪', 'Union'],
    ['∩', 'Intersection'],
    ['¬', 'Not sign'],
    ['∧', 'Logical and'],
    ['∨', 'Logical or'],
  ]),
  category('greek', 'Greek', [
    ['α', 'Greek small letter alpha'],
    ['β', 'Greek small letter beta'],
    ['γ', 'Greek small letter gamma'],
    ['δ', 'Greek small letter delta'],
    ['ε', 'Greek small letter epsilon'],
    ['θ', 'Greek small letter theta'],
    ['λ', 'Greek small letter lambda'],
    ['μ', 'Greek small letter mu'],
    ['π', 'Greek small letter pi'],
    ['ρ', 'Greek small letter rho'],
    ['σ', 'Greek small letter sigma'],
    ['τ', 'Greek small letter tau'],
    ['φ', 'Greek small letter phi'],
    ['ω', 'Greek small letter omega'],
    ['Δ', 'Greek capital letter delta'],
    ['Σ', 'Greek capital letter sigma'],
    ['Φ', 'Greek capital letter phi'],
    ['Ω', 'Greek capital letter omega'],
  ]),
  category('arrows', 'Arrows', [
    ['←', 'Leftwards arrow'],
    ['→', 'Rightwards arrow'],
    ['↑', 'Upwards arrow'],
    ['↓', 'Downwards arrow'],
    ['↔', 'Left right arrow'],
    ['⇐', 'Leftwards double arrow'],
    ['⇒', 'Rightwards double arrow'],
    ['⇔', 'Left right double arrow'],
  ]),
  category('units', 'Units and currency', [
    ['°', 'Degree sign'],
    ['℃', 'Degree Celsius'],
    ['µ', 'Micro sign'],
    ['Ω', 'Ohm sign'],
    ['‰', 'Per mille sign'],
    ['€', 'Euro sign'],
    ['£', 'Pound sign'],
    ['¥', 'Yen sign'],
    ['¢', 'Cent sign'],
  ]),
];

const NAMES = new Map(
  COMMON_SYMBOLS.flatMap((group) =>
    group.characters.map(({ char, name }) => [char, name] as const),
  ),
);

/** The symbol picker's default characters: the common ones, then every block's. */
export const DEFAULT_SYMBOLS: readonly CharacterGridCategory[] = [
  ...COMMON_SYMBOLS,
  ...symbolBlocks(NAMES),
];
