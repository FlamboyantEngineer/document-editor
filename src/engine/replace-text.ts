import type { Transaction } from 'prosemirror-state';

/** Replaces a range with text in the first replaced character's marks, including non-inclusive ones. */
export function replaceMarkedText(
  tr: Transaction,
  { from, to }: { readonly from: number; readonly to: number },
  replacement: string,
): Transaction {
  if (replacement === '') return tr.delete(from, to);
  const marks = tr.doc.nodeAt(from)?.marks;
  return tr.replaceWith(from, to, tr.doc.type.schema.text(replacement, marks));
}
