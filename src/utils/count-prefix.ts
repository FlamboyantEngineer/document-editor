/** How many elements a predicate holds for when it is true only on a prefix. */
export function countPrefix(length: number, holds: (index: number) => boolean): number {
  let first = 0;
  let end = length;
  while (first < end) {
    const middle = first + Math.floor((end - first - 1) / 2);
    if (holds(middle)) first = middle + 1;
    else end = middle;
  }
  return first;
}
