// Whether a change can change what an internal reference reads: typing in body text that holds no
// reference changes no target's number or title, so references are not walked for it, keeping
// the keystroke path free of whole-document work.

import type { MarkType, Node as ProseMirrorNode } from 'prosemirror-model';
import type { Transaction } from 'prosemirror-state';
import { ReplaceStep, type Step } from 'prosemirror-transform';

/** The text blocks no reference target takes its title from. */
const PLAIN_TEXTBLOCKS = new Set(['paragraph', 'footnote_entry']);

// Whether a step only replaces inline content of one plain text block, without a reference.
function isPlainTextStep(step: Step, doc: ProseMirrorNode, type: MarkType): boolean {
  if (!(step instanceof ReplaceStep)) return false;
  const { from, to, slice } = step;
  if (slice.openStart > 0 || slice.openEnd > 0) return false;
  const $from = doc.resolve(from);
  if (!$from.sameParent(doc.resolve(to)) || !PLAIN_TEXTBLOCKS.has($from.parent.type.name)) {
    return false;
  }
  if (from < to && doc.rangeHasMark(from, to, type)) return false;
  let plain = true;
  slice.content.forEach((node) => {
    if (!node.isInline || type.isInSet(node.marks)) plain = false;
  });
  return plain;
}

/**
 * Whether a transaction may change what an internal reference reads: false only when every step
 * replaces inline text of a paragraph or footnote, adding and removing no reference.
 */
export function touchesReferences(tr: Transaction): boolean {
  const type = tr.doc.type.schema.marks.reference;
  if (!type || !tr.docChanged) return false;
  return tr.steps.some((step, index) => {
    const doc = tr.docs[index];
    return !doc || !isPlainTextStep(step, doc, type);
  });
}
