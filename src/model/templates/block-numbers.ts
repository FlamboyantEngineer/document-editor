// The template's own block numbers, which no other template setting gives: a quote's indent and
// spacing, a rule's, a code box's padding, a layout section's gaps (`styles.blocks`). The engine
// lays blocks out with them and the template states them to the stylesheet as custom properties
// (`templateProperties`), so the layout and the drawing take the same numbers from the document's
// template, never from the page that holds it (DOCE-PAGINATION-10.9).

import type { BlockNumberSettings, TemplateStyles } from '../format/template-format.js';

/** A length the template states: in CSS pixels, or in the block's font size. */
type BlockLength = { readonly px: number } | { readonly em: number };

/** The template's block numbers, by name. */
export type BlockNumbers = Readonly<Record<BlockNumberName, BlockLength>>;

type BlockNumberName = keyof BlockNumberSettings;

/** Each number's custom property, and its value when the template states none. */
const blockNumberList = {
  quoteIndent: ['--de-quote-indent', { px: 40 }],
  quoteSpacing: ['--de-quote-spacing', { em: 1 }],
  ruleHeight: ['--de-rule-height', { px: 2 }],
  ruleSpacing: ['--de-rule-spacing', { em: 0.5 }],
  codePadding: ['--de-code-padding', { px: 8 }],
  codeCaptionGap: ['--de-code-caption-gap', { px: 4 }],
  codeCaptionRule: ['--de-code-caption-rule', { px: 1 }],
  tableCaptionPadding: ['--de-table-caption-padding', { px: 2 }],
  equationSpacing: ['--de-equation-spacing', { px: 6 }],
  columnsGap: ['--de-columns-gap', { px: 4 }],
  columnsAfter: ['--de-columns-after', { px: 4 }],
  columnPadding: ['--de-column-padding', { px: 5 }],
  columnBorder: ['--de-column-border', { px: 1 }],
} as const satisfies Record<BlockNumberName, readonly [string, BlockLength]>;

const pxPerUnit: Readonly<Record<string, number>> = {
  px: 1,
  pt: 96 / 72,
  pc: 16,
  in: 96,
  cm: 96 / 2.54,
  mm: 96 / 25.4,
  q: 96 / 101.6,
};

const blockLengthText = (length: BlockLength) =>
  'px' in length ? `${String(length.px)}px` : `${String(length.em)}em`;

/** Each number's custom property name and the value it takes when the template states none. */
export function defaultBlockNumberProperties(): ReadonlyArray<{
  readonly property: string;
  readonly value: string;
}> {
  return Object.values(blockNumberList).map(([property, value]) => ({
    property,
    value: blockLengthText(value),
  }));
}

/** A stated length, or null when it is not one the engine reads: a number with an absolute unit or em. */
export function parseBlockLength(text: unknown): BlockLength | null {
  if (typeof text !== 'string') return null;
  const match = /^(\d+(?:\.\d+)?|\.\d+)(px|pt|pc|in|cm|mm|q|em)$/i.exec(text.trim());
  const unit = match?.[2]?.toLowerCase();
  if (!match || !unit) return null;
  const amount = Number(match[1]);
  if (unit === 'em') return { em: amount };
  return { px: amount * (pxPerUnit[unit] ?? 1) };
}

/** A stated length in CSS pixels, at a block font size of `em`. */
export function blockPixels(length: BlockLength, em: number): number {
  return 'px' in length ? length.px : length.em * em;
}

/**
 * A scope's block numbers: each its styles state, and the default for one they leave out or state
 * as something other than a length in an absolute unit or em (a percentage, `rem`).
 */
export function templateBlockNumbers(styles: TemplateStyles): BlockNumbers {
  const stated = styles.blocks ?? {};
  const read = Object.entries(blockNumberList).map(([name, [, fallback]]) => [
    name,
    parseBlockLength(stated[name as BlockNumberName]) ?? fallback,
  ]);
  return Object.freeze(Object.fromEntries(read) as Record<BlockNumberName, BlockLength>);
}

/** The custom properties that give a scope's stylesheet the block numbers the engine lays out with. */
export function blockNumberProperties(styles: TemplateStyles): Record<string, string> {
  const numbers = templateBlockNumbers(styles);
  return Object.fromEntries(
    Object.entries(blockNumberList).map(([name, [property]]) => [
      property,
      blockLengthText(numbers[name as BlockNumberName]),
    ]),
  );
}
