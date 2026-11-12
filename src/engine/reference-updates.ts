// Whether a change can change what an internal reference reads: typing in body text that holds no
// reference changes no target's number or title, so references are not walked for it, keeping
// the keystroke path free of whole-document work.

import type { MarkType, Node as ProseMirrorNode } from 'prosemirror-model';
import type { Transaction } from 'prosemirror-state';
import { ReplaceStep, type Step } from 'prosemirror-transform';
import { isInlineTextOnly } from './transaction-kind.js';

/** The text blocks no reference target takes its title from. */
const PLAIN_TEXTBLOCKS = new Set(['paragraph', 'footnote_entry']);

// Whether a text step stays in a plain text block and adds or removes no reference.
function isPlainStep(step: Step, doc: ProseMirrorNode | undefined, type: MarkType): boolean {
  if (!doc || !(step instanceof ReplaceStep)) return false;
  const { from, to, slice } = step;
  if (!PLAIN_TEXTBLOCKS.has(doc.resolve(from).parent.type.name)) return false;
  if (from < to && doc.rangeHasMark(from, to, type)) return false;
  let plain = true;
  slice.content.forEach((node) => {
    if (type.isInSet(node.marks)) plain = false;
  });
  return plain;
}

/**
 * Whether a transaction may change what an internal reference reads: false only when it types or
 * deletes text in paragraphs or footnotes (`isInlineTextOnly`), adding and removing no reference.
 */
export function touchesReferences(tr: Transaction): boolean {
  const type = tr.doc.type.schema.marks.reference;
  if (!type || !tr.docChanged) return false;
  if (!isInlineTextOnly(tr)) return true;
  return !tr.steps.every((step, index) => isPlainStep(step, tr.docs[index], type));
}
