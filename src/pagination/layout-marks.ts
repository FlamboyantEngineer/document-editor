// What marks a layout: the transaction that moves a projection onto new pages carries what the
// layouts had done (`layoutStats`), and the laid-out document how its pages were filled
// (`pageMetrics`).

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { type EditorState, PluginKey, type Transaction } from 'prosemirror-state';
import type { PageMetric } from './layout-document.js';
import type { PaginationStats } from './pagination-stats.js';

/** Marks the transactions that move a projection onto new pages. */
export const paginationKey = new PluginKey<boolean>('pagination');

// What the layouts had done, on the transaction a layout moves the editor with.
const statsKey = new PluginKey<PaginationStats>('pagination-stats');

// The pages each laid-out document was laid out as, in order.
const laidOut = new WeakMap<ProseMirrorNode, readonly PageMetric[]>();

/**
 * How the pages of the document a state shows were laid out, in order: what their blocks take of
 * the height they have. None until a layout, and after a change until the next one.
 */
export function pageMetrics(state: EditorState): readonly PageMetric[] | null {
  return laidOut.get(state.doc) ?? null;
}

/**
 * Records how the pages of a laid-out document were laid out (`pageMetrics`), and marks the
 * transaction that moved onto them as a layout's, with what the layouts had done (`layoutStats`),
 * out of the undo history.
 */
export function markLayout(
  tr: Transaction,
  laid: { readonly metrics: readonly PageMetric[]; readonly stats: PaginationStats },
): Transaction {
  laidOut.set(tr.doc, laid.metrics);
  return tr
    .setMeta(statsKey, laid.stats)
    .setMeta(paginationKey, true)
    .setMeta('addToHistory', false);
}

/** Whether a transaction moved the editor onto new pages, rather than changing its content. */
export function isPaginationTransaction(tr: Transaction): boolean {
  return tr.getMeta(paginationKey) === true;
}

/**
 * What its pagination's layouts had done (`PagedProjection.stats`) when a transaction moved the editor
 * onto new pages; null for any other transaction.
 */
export function layoutStats(tr: Transaction): PaginationStats | null {
  return (tr.getMeta(statsKey) as PaginationStats | undefined) ?? null;
}
