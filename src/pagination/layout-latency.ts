// Which changes lay the pages out at once rather than once the writer pauses. Typing settles, so a
// writer is not slowed by a layout per key; a change of structure, such as Enter, a page break, a
// footnote or a paste, moves content between pages, so it lays out on the next frame and the
// writer sees where it went.

import type { Transaction } from 'prosemirror-state';
import { isInlineTextOnly } from '../engine/transaction-kind.js';

/** The meta that asks for the pages to be laid out on the next frame, without settling. */
export const LAYOUT_NOW_META = 'pagination-now';

/** Asks for the pages to be laid out on the next frame after a transaction, without settling. */
export function layoutNow(tr: Transaction): Transaction {
  return tr.setMeta(LAYOUT_NOW_META, true);
}

/**
 * Whether a transaction lays the pages out at once: one marked so (`layoutNow`), a paste or a
 * drop, or any change to the document beyond typing or deleting text inside one textblock.
 */
export function wantsLayoutNow(tr: Transaction): boolean {
  if (tr.getMeta(LAYOUT_NOW_META) === true) return true;
  if (!tr.docChanged) return false;
  const event = tr.getMeta('uiEvent') as unknown;
  return event === 'paste' || event === 'drop' || !isInlineTextOnly(tr);
}
