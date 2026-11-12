// Typing beside a footnote marker: the marker is not text, so the caret takes the formatting of the
// text around the marker, as if the marker were not there.

import { Mark, type Node as ProseMirrorNode, type ResolvedPos } from 'prosemirror-model';
import { isFootnoteMarker } from './footnote-model.js';

// The nearest child that is not a marker, from an index stepping one way, or null.
function textBeside(parent: ProseMirrorNode, index: number, step: 1 | -1): ProseMirrorNode | null {
  for (let at = index; at >= 0 && at < parent.childCount; at += step) {
    const child = parent.child(at);
    if (!isFootnoteMarker(child)) return child;
  }
  return null;
}

/**
 * The marks typing at a caret beside a footnote marker takes: those of the text before the marker,
 * or, at the start of a block, of the text after it, with the marks that end there (links) only when
 * the text on both sides has them. Null when the caret is not beside a marker or the marks the
 * caret has already are those.
 */
export function boundaryMarks($pos: ResolvedPos): readonly Mark[] | null {
  const { parent } = $pos;
  if (!parent.inlineContent || $pos.textOffset > 0) return null;
  const index = $pos.index();
  const before = index > 0 ? parent.child(index - 1) : null;
  const after = index < parent.childCount ? parent.child(index) : null;
  if (!isFootnoteMarker(before) && !(before === null && isFootnoteMarker(after))) return null;
  const left = textBeside(parent, index - 1, -1);
  const right = textBeside(parent, index, 1);
  const main = left ?? right;
  const other = left ? right : null;
  const marks = (main?.marks ?? []).filter(
    (mark) => mark.type.spec.inclusive !== false || (other !== null && mark.isInSet(other.marks)),
  );
  return Mark.sameSet(marks, $pos.marks()) ? null : marks;
}
