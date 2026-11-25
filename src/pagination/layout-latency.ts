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

/** How a canonical change is shown on the pages. */
export interface Showing {
  /** Lays the pages out on the next frame, not once the writer pauses (DOCE-PAGINATION-5.7). */
  readonly now: boolean;
  /** Scrolls the pages to the selection, as a transaction that made the change asked. */
  readonly scroll: boolean;
}

/**
 * How the transactions that made a change show it: laid out at once when one changed the
 * structure, and scrolled to the selection when one asked, as a view of the canonical state does.
 * A change nothing asked to scroll for, such as a collaborator's or a state the host replaced,
 * leaves the pages where the writer reads them.
 */
export function shownBy(made: readonly Transaction[]): Showing {
  return {
    now: made.some(wantsLayoutNow),
    scroll: made.some((each) => each.scrolledIntoView),
  };
}
