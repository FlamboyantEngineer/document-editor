// The height of a line of a block's run, with the atoms on it (DOCE-PAGINATION-9.5).

import type { Strut } from './metrics.js';
import type { TextRun } from './runs.js';

/** The items a line holds, first to last. */
interface ItemSpan {
  readonly firstItem: number;
  readonly lastItem: number;
}

/**
 * A line's height: its strut, grown by each atom on it, which sits on the baseline at its own
 * baseline, or at its bottom when it has none; an atom aligned to the line's top or bottom
 * (`vertical-align: top` or `bottom`) only makes the line at least as tall as itself.
 */
export function lineHeight(run: TextRun, line: ItemSpan, strut: Strut): number {
  let { ascent, descent } = strut;
  let aligned = 0;
  for (let index = line.firstItem; index <= line.lastItem; index += 1) {
    const atom = run.atoms[index];
    if (!atom) continue;
    if (atom.align === 'top' || atom.align === 'bottom') {
      aligned = Math.max(aligned, atom.height);
      continue;
    }
    const baseline = atom.baseline ?? atom.height;
    ascent = Math.max(ascent, baseline);
    descent = Math.max(descent, atom.height - baseline);
  }
  return Math.max(ascent + descent, aligned);
}
