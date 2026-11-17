// A footnote suggested while suggesting: its marker is the suggested insertion, and its entry
// follows the marker (DOCE-FOOTNOTES-1.3), so the entry is inserted as it is, accepted or rejected
// with its marker, and the footnotes' numbers, which the footnote plugin sets after each change,
// are not suggested formatting.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { ReplaceAroundStep, ReplaceStep, type Step } from 'prosemirror-transform';

const FOOTNOTE_PARTS = new Set(['footnote_reference', 'footnote_entry']);

// Whether a step inserts footnote entries only.
const insertsEntries = (step: Step) =>
  step instanceof ReplaceStep &&
  step.from === step.to &&
  step.slice.content.childCount > 0 &&
  step.slice.openStart === 0 &&
  step.slice.openEnd === 0 &&
  Array.from({ length: step.slice.content.childCount }, (_, index) =>
    step.slice.content.child(index),
  ).every((node) => node.type.name === 'footnote_entry');

// Whether a step only renumbers one footnote marker or entry.
function renumbers(step: Step, doc: ProseMirrorNode): boolean {
  if (!(step instanceof ReplaceStep || step instanceof ReplaceAroundStep)) return false;
  const before = doc.nodeAt(step.from);
  const after = step.slice.content.firstChild;
  if (!before || !after || !FOOTNOTE_PARTS.has(before.type.name)) return false;
  if (step.slice.content.childCount !== 1 || after.type !== before.type) return false;
  if (step instanceof ReplaceStep && step.to !== step.from + before.nodeSize) return false;
  const attrs = { ...after.attrs, footnoteNumber: before.attrs.footnoteNumber };
  return before.type.create(attrs, null, after.marks).sameMarkup(before);
}

/**
 * What suggest mode does with a step of a footnote's bookkeeping: `insert` an entry as it is,
 * `skip` a renumbering, which the footnote plugin makes again, or null for any other step.
 */
export function footnoteStep(step: Step, doc: ProseMirrorNode): 'insert' | 'skip' | null {
  if (insertsEntries(step)) return 'insert';
  return renumbers(step, doc) ? 'skip' : null;
}
