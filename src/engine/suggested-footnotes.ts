// A footnote suggested while suggesting: its marker is the suggested insertion, and its entry
// follows the marker (DOCE-FOOTNOTES-1.3), so the entry is inserted as it is, accepted or rejected
// with its marker. Footnote numbers are not content (`createFootnoteNumbers`), so no step sets one.

import { ReplaceStep, type Step } from 'prosemirror-transform';

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

/**
 * What suggest mode does with a step of a footnote's bookkeeping: `insert` an entry as it is, or
 * null for any other step.
 */
export function footnoteStep(step: Step): 'insert' | null {
  return insertsEntries(step) ? 'insert' : null;
}
