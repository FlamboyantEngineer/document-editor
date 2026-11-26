// What the projection hands a host for each canonical transaction its input makes, and what a host
// that takes another transaction in its place gives back (DOCE-PAGINATION-7.26).

import type { EditorState, Transaction } from 'prosemirror-state';

/** A canonical transaction as the projection applied it: the state it was applied to, and made. */
export interface CanonicalChange {
  readonly from: EditorState;
  readonly to: EditorState;
}

/**
 * What a host took in place of a canonical transaction, applied to the same state: the state it
 * made and the transactions applied, the appended ones after it.
 */
export interface CanonicalTaken {
  readonly state: EditorState;
  readonly transactions: readonly Transaction[];
}
