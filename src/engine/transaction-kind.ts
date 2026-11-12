// What kind of change a transaction is. Plugins that derive writes from a change (ids, references,
// table widths, sections, regions) act on the writer's own edits only: a remote change already
// carries the sender's derived writes, so deriving them again on the receiving side writes twice
// and lets the two documents drift apart. A system change is one the library or the host makes for
// the writer, such as a template update or a script's output: it is not the writer's edit, so it is
// never a suggestion and never refused by the edit lock. And a change that only types or deletes
// text inside one textblock lets the hot path skip work over the rest of the document.

import type { Fragment, Node as ProseMirrorNode } from 'prosemirror-model';
import type { Transaction } from 'prosemirror-state';
import { ReplaceStep, type Step } from 'prosemirror-transform';

/** Marks a change that came from elsewhere, such as a collaborator's; out of the history. */
export const REMOTE_META = 'remote';

/** Marks a change a plugin derived from other changes; out of the history. */
export const DERIVED_META = 'derived';

/** Marks a change the library or the host made for the writer. */
export const SYSTEM_META = 'system-change';

const isText = (fragment: Fragment) => {
  let text = true;
  fragment.forEach((child) => {
    text &&= child.isText;
  });
  return text;
};

function isTextStep(step: Step, doc: ProseMirrorNode | undefined): boolean {
  if (!doc || !(step instanceof ReplaceStep)) return false;
  const { from, to, slice } = step;
  if (slice.openStart > 0 || slice.openEnd > 0 || !isText(slice.content)) return false;
  const $from = doc.resolve(from);
  if (!$from.parent.isTextblock || !$from.sameParent(doc.resolve(to))) return false;
  return isText($from.parent.slice($from.parentOffset, $from.parentOffset + to - from).content);
}

/** Marks a transaction as a remote change. */
export function markRemote(tr: Transaction): Transaction {
  return tr.setMeta(REMOTE_META, true).setMeta('addToHistory', false);
}

/** Whether a transaction is a remote change (`markRemote`). */
export function isRemoteTransaction(tr: Transaction): boolean {
  return tr.getMeta(REMOTE_META) === true;
}

/** Marks a transaction as a change derived from others. */
export function markDerived(tr: Transaction): Transaction {
  return tr.setMeta(DERIVED_META, true).setMeta('addToHistory', false);
}

/** Whether a transaction is derived: marked (`markDerived`) or appended by a plugin. */
export function isDerivedTransaction(tr: Transaction): boolean {
  return tr.getMeta(DERIVED_META) === true || tr.getMeta('appendedTransaction') !== undefined;
}

/** Marks a transaction as a change the library or the host made for the writer. */
export function markSystemChange(tr: Transaction): Transaction {
  return tr.setMeta(SYSTEM_META, true);
}

/** Whether a transaction is a system change (`markSystemChange`). */
export function isSystemChange(tr: Transaction): boolean {
  return tr.getMeta(SYSTEM_META) === true;
}

/**
 * Whether a transaction is the writer's own edit: it changes the document and is neither remote
 * (by `isRemote`, `isRemoteTransaction` by default), derived nor a system change.
 */
export function isLocalEdit(
  tr: Transaction,
  isRemote: (tr: Transaction) => boolean = isRemoteTransaction,
): boolean {
  return tr.docChanged && !isRemote(tr) && !isDerivedTransaction(tr) && !isSystemChange(tr);
}

/**
 * Whether every step of a transaction only types or deletes text inside one textblock: no block
 * boundary, inline node, mark or attribute changes. A transaction with no steps is not.
 */
export function isInlineTextOnly(tr: Transaction): boolean {
  return tr.steps.length > 0 && tr.steps.every((step, index) => isTextStep(step, tr.docs[index]));
}
