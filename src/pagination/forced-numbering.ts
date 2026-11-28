// What the forced lines' kept sets were drawn with that is not in a block's node
// (DOCE-PAGINATION-11.2): the headings' numbers and the numbered paragraphs, by position, mapped
// through an ordinary text edit rather than numbered again, and whether they are the same as a
// builder's, by position, so a number another block took draws both blocks again.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { Transaction } from 'prosemirror-state';
import { keepsNumbering } from '../engine/paragraph-numbering.js';
import { keepsAllNumbers } from './engine-numbers.js';
import type { PagesTextEngine } from './text-engine-types.js';

/** The numbers a builder drew its sets with, in the document it drew. */
interface DrawnNumbers {
  readonly engine: PagesTextEngine;
  readonly doc: ProseMirrorNode;
  readonly numbers: ReadonlyMap<number, string>;
  readonly skipped: ReadonlySet<number>;
  readonly labelOf?: ((caption: ProseMirrorNode) => string | undefined) | undefined;
  readonly labels?: string | undefined;
  readonly directions: ReadonlyMap<number, unknown>;
}

/** A document, and the transaction that made it from the one drawn before, if any. */
interface Drawing {
  readonly doc: ProseMirrorNode;
  readonly tr?: Transaction | undefined;
}

// An ordinary text edit leaves the headings, numbered paragraph eligibility and caption nodes
// as they were. Only their positions have moved.
export function numberingFor(
  engine: PagesTextEngine,
  { doc, tr }: Drawing,
  previous: DrawnNumbers | null,
): ReturnType<PagesTextEngine['numbering']> {
  if (previous?.engine !== engine) return engine.numbering(doc);
  const { numbers, skipped, labelOf, labels } = previous;
  if (previous.doc === doc) {
    return { headings: numbers, paragraphs: skipped, labelOf, labelsKey: labels };
  }
  if (!tr || previous.doc !== tr.before || !keepsAllNumbers(tr) || !keepsNumbering(tr)) {
    return engine.numbering(doc);
  }
  return {
    headings: new Map([...numbers].map(([pos, text]) => [tr.mapping.map(pos), text])),
    paragraphs: new Set([...skipped].map((pos) => tr.mapping.map(pos))),
    labelOf,
    labelsKey: labels,
  };
}

// Whether two maps by position hold the same values at the same positions, the first's positions
// mapped into the second's document.
function sameAt<T>(
  a: ReadonlyMap<number, T>,
  b: ReadonlyMap<number, T>,
  map: (pos: number) => number,
): boolean {
  if (a.size !== b.size) return false;
  for (const [pos, value] of a) if (b.get(map(pos)) !== value) return false;
  return true;
}

// Whether the blocks of a document show the numbers and directions they did in the builder's: by
// position, so a heading whose number another heading took is drawn again, though the numbers in
// order are the same (DOCE-PAGINATION-11.2).
export function sameNumbers(
  previous: DrawnNumbers,
  next: {
    numbers: ReadonlyMap<number, string>;
    skipped: ReadonlySet<number>;
    directions: ReadonlyMap<number, unknown>;
  },
  { doc, tr }: Drawing,
): boolean {
  const mapped = previous.doc === doc ? null : tr?.before === previous.doc ? tr.mapping : undefined;
  if (mapped === undefined) return false;
  const map = (pos: number) => (mapped ? mapped.map(pos) : pos);
  const skipped = (set: ReadonlySet<number>) => new Map([...set].map((pos) => [pos, true]));
  return (
    sameAt(previous.numbers, next.numbers, map) &&
    sameAt(skipped(previous.skipped), skipped(next.skipped), map) &&
    sameAt(previous.directions, next.directions, map)
  );
}
