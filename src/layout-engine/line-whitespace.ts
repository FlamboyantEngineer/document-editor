import {
  layoutNextRichInlineLineRange,
  type PreparedRichInline,
  prepareRichInline,
  type RichInlineCursor,
  type RichInlineFragment,
} from '@chenglou/pretext/rich-inline';
import { textWidth } from './metrics.js';
import type { TextRun } from './runs.js';

interface TabTail {
  readonly item: number;
  readonly offset: number;
}

/** The white space one item ends a line with. */
export interface Trailing {
  readonly item: number;
  readonly width: number;
}

function trailingOffset(text: string): number {
  let offset = text.length;
  while (offset > 0) {
    const character = text[offset - 1];
    if (character !== ' ' && character !== '\t') break;
    offset -= 1;
  }
  return offset;
}

/** The spaces at a line's end, including fragments that are entirely white space. */
export function trailingOf(
  items: TextRun['items'],
  fragments: readonly RichInlineFragment[],
): Trailing[] {
  const trailing: Trailing[] = [];
  for (let index = fragments.length - 1; index >= 0; index -= 1) {
    const fragment = fragments[index];
    const item = fragment ? items[fragment.itemIndex] : undefined;
    if (!fragment || !item || !('font' in item)) break;
    const spaces = fragment.text.slice(trailingOffset(fragment.text));
    trailing.push({ item: fragment.itemIndex, width: spaces ? textWidth(spaces, item.font) : 0 });
    if (spaces.length < fragment.text.length) break;
  }
  return trailing;
}

/** Finds the start of a block-final white space suffix containing a tab. */
export function findTabTail(run: TextRun): TabTail | undefined {
  if (run.endsWithBreak) return undefined;
  let tail: TabTail | undefined;
  let hasTab = false;
  for (let index = run.items.length - 1; index >= 0; index -= 1) {
    const item = run.items[index];
    if (!item || !('font' in item) || item.break === 'never') break;
    if ((run.offsets[index] ?? -1) < 0 || (run.sides[index] ?? null) !== null) break;
    const offset = trailingOffset(item.text);
    hasTab ||= item.text.includes('\t', offset);
    if (offset < item.text.length) tail = { item: index, offset };
    if (offset > 0) break;
  }
  return hasTab ? tail : undefined;
}

/** The original items up to the white space, so their fonts and shaping context are kept. */
export function prepareTabPrefix(items: TextRun['items'], tail: TabTail): PreparedRichInline {
  const prefix = items.slice(0, tail.item + 1);
  const last = prefix.at(-1);
  if (last && 'font' in last)
    prefix[tail.item] = { ...last, text: last.text.slice(0, tail.offset) };
  return prepareRichInline(prefix, { whiteSpace: 'pre-wrap' });
}

/** Width before the hanging suffix, at the same start Pretext used to break the last line. */
export function widthBeforeTabTail(
  prefix: PreparedRichInline,
  tail: TabTail,
  {
    items,
    fragments,
    start,
  }: {
    readonly items: TextRun['items'];
    readonly fragments: readonly RichInlineFragment[];
    readonly start: RichInlineCursor;
  },
): number {
  const first = fragments[0];
  const hasPrefix =
    first &&
    (first.itemIndex < tail.item ||
      (first.itemIndex === tail.item && first.sourceStart < tail.offset));
  // The original width can already omit part of the suffix. Lay out the retained prefix from
  // the same cursor so neither tab stops nor available room can distort its width.
  const width = hasPrefix
    ? (layoutNextRichInlineLineRange(prefix, Infinity, start)?.width ?? 0)
    : 0;
  // A fully trimmed text item still paints its inline code padding.
  const removedItemsStart = tail.item + Number(tail.offset > 0);
  let padding = 0;
  for (let index = fragments.length - 1; index >= 0; index -= 1) {
    const fragment = fragments[index];
    if (!fragment || fragment.itemIndex < removedItemsStart) break;
    const item = items[fragment.itemIndex];
    if (item && 'font' in item) padding += Math.min(fragment.occupiedWidth, item.extraWidth ?? 0);
  }
  return width + padding;
}
