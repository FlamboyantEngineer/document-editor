// Running a command on a state of one's own and copying the change it makes onto another
// transaction.

import type { Command, EditorState, Transaction } from 'prosemirror-state';
import { Mapping } from 'prosemirror-transform';

/** The transaction a command would dispatch on a state, or null when it does not apply. */
export function captureTransaction(command: Command, state: EditorState): Transaction | null {
  const captured: { tr: Transaction | null } = { tr: null };
  command(state, (tr) => {
    captured.tr = tr;
  });
  return captured.tr;
}

/** Copies a transaction's steps and selection onto `tr`, whose document is the one it started on. */
export function appendTransaction(tr: Transaction, done: Transaction): Transaction {
  for (const step of done.steps) tr.step(step);
  return tr.setSelection(done.selection.map(tr.doc, new Mapping()));
}
