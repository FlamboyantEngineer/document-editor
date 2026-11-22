// The stylesheet's own block numbers, which no template setting changes: a quote's indent and
// spacing, a rule's, a code box's padding, a layout section's gaps. The stylesheet states each as a
// custom property on the page content and draws its blocks with it, and the engine reads the same
// properties where it measures, so a host stylesheet that draws blocks otherwise changes both
// (DOCE-PAGINATION-10.8).

/** A length the stylesheet states: in CSS pixels, or in the block's font size. */
type SheetLength = { readonly px: number } | { readonly em: number };

/** The stylesheet's block numbers, by name. */
export type SheetNumbers = Readonly<Record<SheetNumberName, SheetLength>>;

type SheetNumberName = keyof typeof sheetPropertyList;

/** Each number's custom property, and its value in the reference stylesheet. */
const sheetPropertyList = {
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
} as const satisfies Record<string, readonly [string, SheetLength]>;

const pxPerUnit: Readonly<Record<string, number>> = {
  px: 1,
  pt: 96 / 72,
  pc: 16,
  in: 96,
  cm: 96 / 2.54,
  mm: 96 / 25.4,
  q: 96 / 101.6,
};

/** The reference stylesheet's numbers. */
export const referenceSheetNumbers: SheetNumbers = Object.freeze(
  Object.fromEntries(
    Object.entries(sheetPropertyList).map(([name, [, value]]) => [name, value]),
  ) as Record<SheetNumberName, SheetLength>,
);

/** Each number's custom property name and its reference value as the stylesheet writes it. */
export function sheetProperties(): ReadonlyArray<{
  readonly property: string;
  readonly value: string;
}> {
  return Object.values(sheetPropertyList).map(([property, value]) => ({
    property,
    value: 'px' in value ? `${String(value.px)}px` : `${String(value.em)}em`,
  }));
}

/** A stated length, or null when it is not one this reads: a number with an absolute unit or em. */
export function parseSheetLength(text: string): SheetLength | null {
  const match = /^(\d+(?:\.\d+)?|\.\d+)(px|pt|pc|in|cm|mm|q|em)$/i.exec(text.trim());
  const unit = match?.[2]?.toLowerCase();
  if (!match || !unit) return null;
  const amount = Number(match[1]);
  if (unit === 'em') return { em: amount };
  return { px: amount * (pxPerUnit[unit] ?? 1) };
}

/** A stated length in CSS pixels, at a block font size of `em`. */
export function sheetPixels(length: SheetLength, em: number): number {
  return 'px' in length ? length.px : length.em * em;
}

/**
 * The numbers the stylesheet states where `element` stands, each one it leaves out or states as
 * something other than a plain length the reference value.
 */
export function readSheetNumbers(element: Element): SheetNumbers {
  const view = element.ownerDocument.defaultView;
  if (!view) return referenceSheetNumbers;
  const style = view.getComputedStyle(element);
  const read = Object.entries(sheetPropertyList).map(([name, [property, fallback]]) => [
    name,
    parseSheetLength(style.getPropertyValue(property)) ?? fallback,
  ]);
  return Object.freeze(Object.fromEntries(read) as Record<SheetNumberName, SheetLength>);
}
