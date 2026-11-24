// The range where two ProseMirror fragments differ, as the editor's diffs, mirrors and replays
// find it.

import type { Fragment } from 'prosemirror-model';

/** Where two fragments differ: from `start` to `endA` in the first, to `endB` in the second. */
interface FragmentDiff {
  readonly start: number;
  readonly endA: number;
  readonly endB: number;
}

/**
 * The range from the first difference of two fragments to the start of their common suffix, or
 * null when they are equal. A common suffix that reaches back over the common prefix, as when
 * `a.` becomes `a. b.`, is shortened so that neither end comes before `start`.
 */
export function diffFragments(a: Fragment, b: Fragment): FragmentDiff | null {
  const start = a.findDiffStart(b);
  if (start === null) return null;
  // Only equal fragments have no end, and findDiffStart has found these differ.
  const end = a.findDiffEnd(b) ?? { a: a.size, b: b.size };
  const overlap = Math.max(0, start - Math.min(end.a, end.b));
  return { start, endA: end.a + overlap, endB: end.b + overlap };
}
