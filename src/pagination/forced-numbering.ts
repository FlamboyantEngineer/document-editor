// What the forced lines' kept sets were drawn with that is not in a block's node
// (DOCE-PAGINATION-11.2): the headings' numbers and the numbered paragraphs, by position, mapped
// through an ordinary text edit rather than numbered again, and whether they are the same as a
// builder's, by position, so a number another block took draws both blocks again.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { Transaction } from 'prosemirror-state';
import { keepsNumbering } from '../engine/paragraph-numbering.js';
import type { ParagraphNumber } from '../layout-engine/numbers.js';
import { keepsAllNumbers } from './engine-numbers.js';
import type { PagesTextEngine } from './text-engine-types.js';

/** The numbers a builder drew its sets with, in the document it drew. */
interface DrawnNumbers {
  readonly engine: PagesTextEngine;
  readonly doc: ProseMirrorNode;
  readonly numbers: ReadonlyMap<number, string>;
  readonly paragraphs: ReadonlyMap<number, ParagraphNumber>;
  readonly labelOf?: ((caption: ProseMirrorNode) => string | undefined) | undefined;
  readonly labels?: string | undefined;
  readonly directions: ReadonlyMap<number, unknown>;
  readonly continuing: ReadonlySet<number>;
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
  const { numbers, paragraphs, labelOf, labels } = previous;
  if (previous.doc === doc) {
    return { headings: numbers, paragraphs, labelOf, labelsKey: labels };
  }
  if (!tr || previous.doc !== tr.before || !keepsAllNumbers(tr) || !keepsNumbering(tr)) {
    return engine.numbering(doc);
  }
  return {
    headings: new Map([...numbers].map(([pos, text]) => [tr.mapping.map(pos), text])),
    paragraphs: new Map([...paragraphs].map(([pos, number]) => [tr.mapping.map(pos), number])),
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

// Whether the blocks of a document show the numbers and directions they did in the builder's, and
// the same parts run on into a next part: by position, so a heading whose number another heading
// took is drawn again, though the numbers in order are the same, and a part whose next part now
// starts at a hard break draws its last line as the block's own (DOCE-PAGINATION-11.2).
export function sameNumbers(
  previous: DrawnNumbers,
  next: {
    numbers: ReadonlyMap<number, string>;
    paragraphs: ReadonlyMap<number, ParagraphNumber>;
    directions: ReadonlyMap<number, unknown>;
    continuing: ReadonlySet<number>;
  },
  { doc, tr }: Drawing,
): boolean {
  const mapped = previous.doc === doc ? null : tr?.before === previous.doc ? tr.mapping : undefined;
  if (mapped === undefined) return false;
  const map = (pos: number) => (mapped ? mapped.map(pos) : pos);
  const marked = (set: ReadonlySet<number>) => new Map([...set].map((pos) => [pos, true]));
  // A number is the same when it shows the same label at the same level, on a first part or not.
  const shown = (numbers: ReadonlyMap<number, ParagraphNumber>) =>
    new Map(
      [...numbers].map(([pos, { label, level, continued }]) => [
        pos,
        `${String(level)} ${continued ? '+' : ''}${label}`,
      ]),
    );
  return (
    sameAt(previous.numbers, next.numbers, map) &&
    sameAt(shown(previous.paragraphs), shown(next.paragraphs), map) &&
    sameAt(previous.directions, next.directions, map) &&
    sameAt(marked(previous.continuing), marked(next.continuing), map)
  );
}
