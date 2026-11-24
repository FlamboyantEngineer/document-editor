// A page join can move content by removing it from one container and inserting it in another.
// Pair the two maps so positions inside the moved content survive the join and its inverse.

import type { Mapping, Transform } from 'prosemirror-transform';

/** Pairs the last step of a page transform with the earlier step whose content it moved. */
export function mirrorPageMove(tr: Transform, earlier: number): void {
  const mapping = tr.mapping as Mapping & { setMirror(later: number, earlier: number): void };
  mapping.setMirror(tr.steps.length - 1, earlier);
}

/** Replays a page join backwards, retaining its content moves in the new mapping. */
export function invertPageJoin(tr: Transform, join: Transform): boolean {
  const inverseEnd = tr.steps.length + join.steps.length - 1;
  for (let index = join.steps.length - 1; index >= 0; index -= 1) {
    const step = join.steps[index];
    const doc = join.docs[index];
    if (!step || !doc || tr.maybeStep(step.invert(doc)).failed) return false;
    const mirror = join.mapping.getMirror(index);
    if (mirror !== undefined && mirror > index) mirrorPageMove(tr, inverseEnd - mirror);
  }
  return true;
}
