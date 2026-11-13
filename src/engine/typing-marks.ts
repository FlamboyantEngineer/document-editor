// The marks typing at the caret takes, where they are not simply those of the text there: beside a
// footnote marker, and inside text a suggestion deletes.

import type { Mark, ResolvedPos } from 'prosemirror-model';
import { boundaryMarks } from './footnote-marks.js';

const isDeletion = (mark: Mark) => mark.type.name === 'deletion';

/**
 * The marks typing at a caret takes, when they are not the marks the caret has already: beside a
 * footnote marker those of the text around it (`boundaryMarks`), and inside text a suggestion
 * deletes the formatting there without the deletion, so what a writer types is never deleted with
 * it. Null when the caret's own marks are those.
 */
export function typingMarks($pos: ResolvedPos): readonly Mark[] | null {
  const beside = boundaryMarks($pos);
  if (!$pos.parent.inlineContent) return beside;
  const marks = beside ?? $pos.marks();
  return marks.some(isDeletion) ? marks.filter((mark) => !isDeletion(mark)) : beside;
}
