// Keeping a table's columns within a width: a table an edit widened gives back what is too much
// from the columns that grew, and a table brought in from elsewhere shrinks every column in
// proportion. Neither goes below the narrowest a column may be. Pure numbers, so a server fits the
// tables of a document it composes the way the editor does.

/** The narrowest a column can be, in pixels. */
export const DEFAULT_TABLE_CELL_MIN_WIDTH = 32;

const sum = (widths: readonly number[]) => widths.reduce((total, width) => total + width, 0);

/**
 * The column widths that fit a width: the columns that grew since `before` shrink, the widest
 * first, by what the total is too much; unchanged when the table fits.
 */
export function fitColumns(
  widths: readonly number[],
  before: readonly number[],
  max: number,
): number[] {
  const fitted = [...widths];
  let excess = sum(fitted) - max;
  const grown = fitted
    .map((width, index) => ({ index, growth: width - (before[index] ?? width) }))
    .filter(({ growth }) => growth > 0)
    .sort((a, b) => (fitted[b.index] ?? 0) - (fitted[a.index] ?? 0));
  for (const { index } of grown) {
    if (excess <= 0) break;
    const width = fitted[index] ?? 0;
    const give = Math.min(excess, width - DEFAULT_TABLE_CELL_MIN_WIDTH);
    if (give <= 0) continue;
    fitted[index] = width - give;
    excess -= give;
  }
  return fitted;
}

/**
 * The column widths that fit a width, each shrunk in proportion to its own width and rounded down
 * to whole pixels, never below the narrowest a column may be; unchanged when the table fits.
 */
export function scaleColumns(widths: readonly number[], max: number): number[] {
  const total = sum(widths);
  if (total <= max || total <= 0) return [...widths];
  const floor = Math.min(DEFAULT_TABLE_CELL_MIN_WIDTH, ...widths);
  // Columns held at the minimum take their share out of what the others may have.
  let fixed = new Set<number>();
  for (;;) {
    const free = sum(widths.filter((_, index) => !fixed.has(index)));
    const room = max - fixed.size * floor;
    const scale = free > 0 ? Math.max(0, room) / free : 0;
    const next = new Set(
      widths.flatMap((width, index) => (fixed.has(index) || width * scale >= floor ? [] : [index])),
    );
    if (next.size === 0) {
      return widths.map((width, index) =>
        fixed.has(index) ? floor : Math.max(floor, Math.floor(width * scale)),
      );
    }
    fixed = new Set([...fixed, ...next]);
  }
}

/**
 * The column widths that fill a width exactly, each in proportion to its own width, in whole
 * pixels, the pixels rounding leaves going to the columns that lost most to it; the widths
 * `scaleColumns` gives when the width cannot hold every column at the narrowest a column may be.
 */
export function fillColumns(widths: readonly number[], available: number): number[] {
  const width = Math.floor(available);
  const total = sum(widths);
  const floor = Math.min(DEFAULT_TABLE_CELL_MIN_WIDTH, ...widths);
  if (total <= 0 || width < widths.length * floor) return scaleColumns(widths, width);
  const exact = widths.map((each) => (each * width) / total);
  const filled = exact.map((each) => Math.max(floor, Math.floor(each)));
  const order = exact
    .map((each, index) => ({ index, lost: each - Math.floor(each) }))
    .sort((a, b) => b.lost - a.lost);
  for (let left = width - sum(filled), at = 0; left > 0; left -= 1, at += 1) {
    const index = order[at % order.length]?.index ?? 0;
    filled[index] = (filled[index] ?? 0) + 1;
  }
  return sum(filled) > width ? scaleColumns(widths, width) : filled;
}
