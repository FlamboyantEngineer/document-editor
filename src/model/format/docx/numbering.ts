// The numbering part: the numbering definitions a document uses and the numbers that name them.
// The writer records a definition for each numbering scope's headings and paragraphs and for
// lists, then a number for each run that counts on its own: the paragraphs after each heading, and
// each numbered list, which starts where the list does.

import type { TemplateStyles } from '../template-format.js';
import {
  bulletLevels,
  headingLevels,
  numberLevels,
  paragraphLevels,
  type WordLevel,
  writeLevel,
} from './numbering-levels.js';
import { escapeXml, WORD_NAMESPACES, XML_DECLARATION } from './word-xml.js';

/** The names the reader knows each kind of definition by. */
export type NumberingKind = 'Headings' | 'Paragraphs' | 'Bullets' | 'Numbers';

/** The numbering definitions and numbers a document has recorded so far. */
export interface WordNumbering {
  readonly definitions: string[];
  readonly numbers: string[];
}

/** One numbering scope's definitions and its current numbers. */
export interface NumberingScope {
  readonly headings: number;
  readonly paragraphDefinition: number;
  /** The paragraphs' number, renewed after each heading so that they count from 1 again. */
  paragraphs: number;
  readonly bullets: number;
  readonly numbersDefinition: number;
}

/** A document's numbering, with nothing recorded. */
export function createWordNumbering(): WordNumbering {
  return { definitions: [], numbers: [] };
}

function addDefinition(numbering: WordNumbering, kind: NumberingKind, levels: WordLevel[]): number {
  const id = numbering.definitions.length;
  numbering.definitions.push(
    [
      `<w:abstractNum w:abstractNumId="${String(id)}">`,
      `<w:multiLevelType w:val="${levels.length > 1 ? 'multilevel' : 'singleLevel'}"/>`,
      `<w:name w:val="${escapeXml(kind)}"/>`,
      ...levels.map(writeLevel),
      '</w:abstractNum>',
    ].join(''),
  );
  return id;
}

/** How a number starts its definition's levels: how many from 1 again, and one from `start`. */
export interface NumberStart {
  readonly levels?: number | undefined;
  readonly start?: number | undefined;
  /** The level that starts from `start`, from 0. */
  readonly startLevel?: number | undefined;
}

/** Records a number for a definition, starting its levels again, and returns its id. */
export function addNumber(
  numbering: WordNumbering,
  definition: number,
  { levels = 0, start = 1, startLevel = 0 }: NumberStart = {},
): number {
  const id = numbering.numbers.length + 1;
  const overrides = Array.from(
    { length: levels },
    (_, level) =>
      `<w:lvlOverride w:ilvl="${String(level)}"><w:startOverride w:val="${String(level === startLevel ? start : 1)}"/></w:lvlOverride>`,
  ).join('');
  numbering.numbers.push(
    `<w:num w:numId="${String(id)}"><w:abstractNumId w:val="${String(definition)}"/>${overrides}</w:num>`,
  );
  return id;
}

/** Records a numbering scope's definitions, from its styles, with its first numbers. */
export function addNumberingScope(
  numbering: WordNumbering,
  styles: TemplateStyles,
): NumberingScope {
  const headings = addDefinition(numbering, 'Headings', headingLevels(styles));
  const paragraphDefinition = addDefinition(numbering, 'Paragraphs', paragraphLevels(styles));
  const bullets = addDefinition(numbering, 'Bullets', bulletLevels(styles.list));
  const numbersDefinition = addDefinition(numbering, 'Numbers', numberLevels(styles.list));
  return {
    headings: addNumber(numbering, headings, { levels: 6 }),
    paragraphDefinition,
    paragraphs: addNumber(numbering, paragraphDefinition, { levels: 6 }),
    bullets: addNumber(numbering, bullets),
    numbersDefinition,
  };
}

/** Starts the scope's paragraphs counting from 1 again, as after a heading. */
export function restartParagraphs(numbering: WordNumbering, scope: NumberingScope): void {
  scope.paragraphs = addNumber(numbering, scope.paragraphDefinition, { levels: 6 });
}

/** A numbered list's own number, its level counting from its first item's number. */
export function addNumberedList(
  numbering: WordNumbering,
  scope: NumberingScope,
  { start, level }: { start: number; level: number },
): number {
  return addNumber(numbering, scope.numbersDefinition, { levels: 9, start, startLevel: level });
}

/** A paragraph's numbering properties: a number and the level in it, from 0. */
export function numberingProperties(number: number, level: number): string {
  return `<w:numPr><w:ilvl w:val="${String(level)}"/><w:numId w:val="${String(number)}"/></w:numPr>`;
}

/** The numbering part: every definition, then every number. */
export function writeNumberingPart(numbering: WordNumbering): string {
  return [
    XML_DECLARATION,
    `<w:numbering ${WORD_NAMESPACES}>`,
    ...numbering.definitions,
    ...numbering.numbers,
    '</w:numbering>',
  ].join('');
}
