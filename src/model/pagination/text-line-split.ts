import { countPrefix } from '../../utils/count-prefix.js';
import type { TextSplitInput, TextSplitPlan } from './text-split.js';

/** The fewest rendered lines either fragment of a split paragraph keeps. */
export const MINIMUM_SPLIT_LINES = 2;

interface MeasuredLine {
  readonly from: number;
  readonly height: number;
  /** A line that starts among widgets at `from`. A fragment boundary cannot divide them. */
  readonly side?: number | undefined;
  /** A line that starts inside a widget at `from`. */
  readonly inWord?: true | undefined;
}

/** The lines a layout engine laid a text block out on, by content offset in the whole block. */
export interface MeasuredLines {
  readonly lines: readonly MeasuredLine[];
}

interface LineIndex {
  readonly ordered: boolean;
  /** Exact cumulative heights, when all lines and their sums fit in binary layout units. */
  readonly heights: Float64Array | null;
}

const kept = new WeakMap<readonly MeasuredLine[], LineIndex>();
const UNITS_PER_PIXEL = 64;

function indexed(lines: readonly MeasuredLine[]): LineIndex {
  const found = kept.get(lines);
  if (found) return found;
  const heights = new Float64Array(lines.length + 1);
  let ordered = true;
  let exact = true;
  let before = Number.NEGATIVE_INFINITY;
  let total = 0;
  for (const [index, { from, height }] of lines.entries()) {
    ordered &&= from >= before;
    before = from;
    total += height;
    exact &&=
      height >= 0 &&
      Number.isSafeInteger(height * UNITS_PER_PIXEL) &&
      Number.isSafeInteger(total * UNITS_PER_PIXEL);
    heights[index + 1] = total;
  }
  const index = { ordered, heights: exact ? heights : null };
  kept.set(lines, index);
  return index;
}

/** The height a split part reserves, to the nearest thousandth of a pixel. */
export function snapSplitHeight(value: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.round(value * 1000) / 1000) : 1;
}

function sumHeights(lines: readonly MeasuredLine[], first: number, end: number): number {
  let height = 0;
  for (let index = first; index < end; index += 1) height += lines[index]?.height ?? 0;
  return height;
}

interface FragmentLines {
  readonly lines: readonly MeasuredLine[];
  readonly first: number;
  readonly last: number;
  readonly height: number;
}

function linesWithin(lines: readonly MeasuredLine[], start: number, end: number): FragmentLines {
  const { ordered, heights } = indexed(lines);
  if (!ordered) {
    const found = lines.filter((line) => line.from >= start && line.from <= end);
    return {
      lines: found,
      first: 0,
      last: found.length,
      height: sumHeights(found, 0, found.length),
    };
  }
  const first = countPrefix(lines.length, (index) => !((lines[index]?.from ?? 0) >= start));
  // The empty line after a final hard break starts at the fragment's end and counts as a line.
  const last = countPrefix(lines.length, (index) => (lines[index]?.from ?? 0) <= end);
  const height = heights
    ? (heights[last] ?? 0) - (heights[first] ?? 0)
    : sumHeights(lines, first, last);
  return { lines, first, last, height };
}

// A split must advance through the block's content and leave the widgets at one offset together.
function canSplitAt(
  lines: readonly MeasuredLine[],
  index: number,
  { offset, end }: { offset: number; end: number },
): boolean {
  const line = lines[index];
  return (
    line !== undefined &&
    line.from > offset &&
    line.from < end &&
    line.side === undefined &&
    !line.inWord &&
    line.from !== lines[index - 1]?.from &&
    line.from !== lines[index + 1]?.from
  );
}

interface LineSplitInput extends Omit<TextSplitInput, 'text'> {
  readonly length: number;
}

/** A paragraph's split at the latest fitting line start that can be a fragment boundary. */
export function planLineSplit(
  input: LineSplitInput,
  measured: MeasuredLines,
): TextSplitPlan | null {
  const { offset } = input.measurement;
  const start = offset + (input.hiddenStart ?? 0);
  const end = offset + input.length;
  const { lines, first, last, height } = linesWithin(measured.lines, start, end);
  const overhead = Math.max(0, input.height - height);
  const trailing = Math.max(MINIMUM_SPLIT_LINES, Math.floor(input.minimumTrailingLines ?? 0));
  // Only the visible part of this page needs sequential fitting checks. Keep the same order of
  // additions used to decide whether a fractional height exactly fits.
  let index = first;
  let fittingHeight = overhead;
  while (index < last - trailing && fittingHeight + (lines[index]?.height ?? 0) <= input.fitting) {
    fittingHeight += lines[index]?.height ?? 0;
    index += 1;
  }
  const minimum = first + MINIMUM_SPLIT_LINES;
  while (index >= minimum && !canSplitAt(lines, index, { offset, end })) index -= 1;
  const next = lines[index]?.from;
  if (index < minimum || next === undefined) return null;
  const headHeight = snapSplitHeight(overhead + sumHeights(lines, first, index));
  return {
    end: next - offset,
    next: next - offset,
    headHeight,
    tailHeight: snapSplitHeight(input.height - headHeight),
  };
}
