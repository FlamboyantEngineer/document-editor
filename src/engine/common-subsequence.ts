// The longest common subsequence of two lists, as the pairs of indexes it matches. The common start
// and end are matched first, so a small change in a long list compares only its middle.

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

/** The index pairs `[i, j]` where `a[i] === b[j]` of a longest common subsequence, in order. */
export function commonSubsequence<T>(a: readonly T[], b: readonly T[]): [number, number][] {
  const [start, end] = sharedEnds(a, b);
  const pairs: [number, number][] = [];
  for (let k = 0; k < start; k += 1) pairs.push([k, k]);
  const middleA = a.slice(start, a.length - end);
  const middleB = b.slice(start, b.length - end);
  const table = lengths(middleA, middleB);
  let i = 0;
  let j = 0;
  while (i < middleA.length && j < middleB.length) {
    if (middleA[i] === middleB[j]) {
      pairs.push([start + i, start + j]);
      i += 1;
      j += 1;
    } else if ((table[i + 1]?.[j] ?? 0) >= (table[i]?.[j + 1] ?? 0)) i += 1;
    else j += 1;
  }
  for (let k = 0; k < end; k += 1) pairs.push([a.length - end + k, b.length - end + k]);
  return pairs;
}
