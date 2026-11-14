// Changed content as units, aligned between before and after (DOCE-COLLAB-6.6): a character of
// text, an inline node, or the start of a text block, so a run of changed text blocks compares as
// one text, as when deciding a suggested split joins two blocks' text into one.

import { Mark, type Node } from 'prosemirror-model';

/** One character of text, one inline node, or the start of a text block. */
export interface Unit {
  readonly text: string | null;
  /** The inline node, or the text block the unit starts. */
  readonly node: Node | null;
  readonly isBlock: boolean;
  readonly marks: readonly Mark[];
}

/** Which units stay, with their marks changed or not, which go and which come. */
export interface Alignment {
  readonly pairs: readonly (readonly [Unit, Unit])[];
  readonly gone: readonly Unit[];
  readonly come: readonly Unit[];
}

// The most cells an alignment may take.
const ALIGN_LIMIT = 250_000;

/** The units of a text block's content, after the unit that starts it when `withStart`. */
export function unitsOf(block: Node, withStart = false): Unit[] {
  const units: Unit[] = withStart
    ? [{ text: null, node: block, isBlock: true, marks: block.marks }]
    : [];
  block.forEach((child) => {
    if (!child.isText) units.push({ text: null, node: child, isBlock: false, marks: child.marks });
    else
      for (const text of child.text ?? '')
        units.push({ text, node: null, isBlock: false, marks: child.marks });
  });
  return units;
}

/** Whether two units are the same but for their marks; block starts by their type alone. */
export function isSameUnit(a: Unit, b: Unit): boolean {
  if (a.isBlock || b.isBlock) return a.isBlock && b.isBlock && a.node?.type === b.node?.type;
  if (a.node && b.node) return a.node.mark(Mark.none).eq(b.node.mark(Mark.none));
  return a.text !== null && a.text === b.text;
}

// Whether two units are the same, marks and a block's attributes included.
function isEqualUnit(a: Unit, b: Unit): boolean {
  if (!isSameUnit(a, b) || !Mark.sameSet(a.marks, b.marks)) return false;
  return !a.isBlock || Boolean(a.node && b.node && a.node.hasMarkup(b.node.type, b.node.attrs));
}

/** How many items match at the start of both lists, and then at their ends. */
export function commonEnds<T>(a: readonly T[], b: readonly T[], same: (x: T, y: T) => boolean) {
  let start = 0;
  while (start < a.length && start < b.length && same(a[start] as T, b[start] as T)) start += 1;
  let end = 0;
  const left = (list: readonly T[]) => list[list.length - 1 - end] as T;
  while (end < a.length - start && end < b.length - start && same(left(a), left(b))) end += 1;
  return { start, end };
}

/** What leaving a unit out, taking one in, or keeping one as another costs an alignment. */
export interface UnitCosts {
  gone(unit: Unit): number;
  come(unit: Unit): number;
  /** Keeping `a` as `b`, which are the same but for their marks. */
  kept(a: Unit, b: Unit): number;
}

// The least cost of aligning every pair of suffixes, by dynamic programming.
function costTable(gone: readonly Unit[], come: readonly Unit[], costs: UnitCosts) {
  const goneCost = gone.map((unit) => costs.gone(unit));
  const comeCost = come.map((unit) => costs.come(unit));
  const width = come.length + 1;
  const table = new Float64Array((gone.length + 1) * width);
  const at = (i: number, j: number) => table[i * width + j] ?? 0;
  const leave = (i: number, j: number) => at(i + 1, j) + (goneCost[i] ?? 0);
  const take = (i: number, j: number) => at(i, j + 1) + (comeCost[j] ?? 0);
  const keep = (i: number, j: number) => {
    const a = gone[i] as Unit;
    const b = come[j] as Unit;
    return isSameUnit(a, b) ? costs.kept(a, b) + at(i + 1, j + 1) : Infinity;
  };
  for (let i = gone.length; i >= 0; i -= 1)
    for (let j = come.length; j >= 0; j -= 1) {
      if (i === gone.length && j === come.length) continue;
      const best = Math.min(
        i < gone.length ? leave(i, j) : Infinity,
        j < come.length ? take(i, j) : Infinity,
        i < gone.length && j < come.length ? keep(i, j) : Infinity,
      );
      table[i * width + j] = best;
    }
  return { at, leave, keep };
}

/**
 * Aligns two runs of units, past the units they share at both ends, at the least cost: the
 * cheapest way to read one run as made from the other. `null` when what lies between is too long
 * to align.
 */
export function alignUnits(
  before: readonly Unit[],
  after: readonly Unit[],
  costs: UnitCosts,
): Alignment | null {
  const ends = commonEnds(before, after, isEqualUnit);
  const gone = before.slice(ends.start, before.length - ends.end);
  const come = after.slice(ends.start, after.length - ends.end);
  if (gone.length * come.length > ALIGN_LIMIT) return null;
  const { at, leave, keep } = costTable(gone, come, costs);
  const pairs: [Unit, Unit][] = [];
  const left: Unit[] = [];
  const right: Unit[] = [];
  let i = 0;
  let j = 0;
  while (i < gone.length && j < come.length) {
    if (keep(i, j) === at(i, j)) {
      pairs.push([gone[i] as Unit, come[j] as Unit]);
      i += 1;
      j += 1;
    } else if (leave(i, j) === at(i, j)) left.push(gone[i++] as Unit);
    else right.push(come[j++] as Unit);
  }
  return { pairs, gone: [...left, ...gone.slice(i)], come: [...right, ...come.slice(j)] };
}
