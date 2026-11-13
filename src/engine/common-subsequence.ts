// A common subsequence of two lists, as the pairs of indexes it matches: the longest one when the
// lists are short. The common start and end are matched first, so a small change in a long list
// compares only its middle. A middle too long for a table of every pair of its items is matched by
// the items each list holds once, kept in order, and the gaps between those the same way, by a
// table while the pairs one comparison may fill last. The time and the memory a comparison takes
// are so bounded; what is left then matches nothing.

// The pairs of items one comparison may fill tables for: 4 MB of table and a few milliseconds.
const MAX_TABLE_PAIRS = 1_000_000;

type Pairs = [number, number][];

// What a comparison has matched so far, and the pairs it may still fill tables for.
interface Matching {
  readonly pairs: Pairs;
  left: number;
}

// Where two lists being matched start in the lists compared.
interface Place {
  readonly matching: Matching;
  readonly at: readonly [number, number];
}

function sharedEnds<T>(a: readonly T[], b: readonly T[]): [number, number] {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1;
  let end = 0;
  const most = Math.min(a.length, b.length) - start;
  while (end < most && a[a.length - 1 - end] === b[b.length - 1 - end]) end += 1;
  return [start, end];
}

// From each pair of positions, the length of the longest common subsequence to the end.
function lengths<T>(a: readonly T[], b: readonly T[]): Int32Array[] {
  const table = Array.from({ length: a.length + 1 }, () => new Int32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    const row = table[i] as Int32Array;
    const below = table[i + 1] as Int32Array;
    for (let j = b.length - 1; j >= 0; j -= 1) {
      row[j] =
        a[i] === b[j]
          ? (below[j + 1] as number) + 1
          : Math.max(below[j] as number, row[j + 1] as number);
    }
  }
  return table;
}

// The longest common subsequence of two short lists, read off the table of its lengths.
function byTable<T>(a: readonly T[], b: readonly T[]): Pairs {
  const table = lengths(a, b);
  const pairs: Pairs = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      pairs.push([i, j]);
      i += 1;
      j += 1;
    } else if ((table[i + 1]?.[j] ?? 0) >= (table[i]?.[j + 1] ?? 0)) i += 1;
    else j += 1;
  }
  return pairs;
}

// Where each item is in a list that holds it once; -1 for an item it holds more than once.
function placesOf<T>(list: readonly T[]): Map<T, number> {
  const places = new Map<T, number>();
  list.forEach((item, index) => places.set(item, places.has(item) ? -1 : index));
  return places;
}

// The items each list holds exactly once, as their places in both, in the first list's order.
function heldOnce<T>(a: readonly T[], b: readonly T[]): Pairs {
  const inA = placesOf(a);
  const inB = placesOf(b);
  const pairs: Pairs = [];
  a.forEach((item, index) => {
    const other = inB.get(item) ?? -1;
    if (inA.get(item) === index && other >= 0) pairs.push([index, other]);
  });
  return pairs;
}

// The longest run of pairs whose places in the second list rise, found as patience sorting does:
// `ends[n]` is the last pair of the best run of n + 1 pairs so far, `before` the pair ahead of each.
function rising(pairs: Pairs): Pairs {
  const ends: number[] = [];
  const before: number[] = [];
  pairs.forEach(([, place], index) => {
    let low = 0;
    let high = ends.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if ((pairs[ends[middle] ?? 0]?.[1] ?? 0) < place) low = middle + 1;
      else high = middle;
    }
    before[index] = ends[low - 1] ?? -1;
    ends[low] = index;
  });
  const run: Pairs = [];
  for (let index = ends.at(-1) ?? -1; index >= 0; index = before[index] ?? -1) {
    const pair = pairs[index];
    if (pair) run.push(pair);
  }
  return run.reverse();
}

// Matches two lists that share neither their start nor their end: by a table when the pairs left
// allow one, else by the items each holds once and the gaps between them. Lists too long for a
// table that hold no such item match nothing.
function matchMiddle<T>(a: readonly T[], b: readonly T[], { matching, at }: Place): void {
  const [atA, atB] = at;
  const pairs = a.length * b.length;
  if (pairs === 0) return;
  if (pairs <= matching.left) {
    matching.left -= pairs;
    for (const [i, j] of byTable(a, b)) matching.pairs.push([atA + i, atB + j]);
    return;
  }
  let i = 0;
  let j = 0;
  for (const [nextI, nextJ] of rising(heldOnce(a, b))) {
    match(a.slice(i, nextI), b.slice(j, nextJ), { matching, at: [atA + i, atB + j] });
    matching.pairs.push([atA + nextI, atB + nextJ]);
    i = nextI + 1;
    j = nextJ + 1;
  }
  // Without an item held once the gap is the lists themselves, which would never end.
  if (i > 0) match(a.slice(i), b.slice(j), { matching, at: [atA + i, atB + j] });
}

// Matches two lists: the start and the end they share, then what is between.
function match<T>(a: readonly T[], b: readonly T[], { matching, at }: Place): void {
  const [atA, atB] = at;
  const [start, end] = sharedEnds(a, b);
  for (let k = 0; k < start; k += 1) matching.pairs.push([atA + k, atB + k]);
  matchMiddle(a.slice(start, a.length - end), b.slice(start, b.length - end), {
    matching,
    at: [atA + start, atB + start],
  });
  for (let k = end; k > 0; k -= 1) matching.pairs.push([atA + a.length - k, atB + b.length - k]);
}

/**
 * The index pairs `[i, j]` where `a[i] === b[j]` of a common subsequence, in order: the longest
 * one, unless the lists differ over a stretch too long to compare every pair of its items.
 */
export function commonSubsequence<T>(a: readonly T[], b: readonly T[]): [number, number][] {
  const matching: Matching = { pairs: [], left: MAX_TABLE_PAIRS };
  match(a, b, { matching, at: [0, 0] });
  return matching.pairs;
}
