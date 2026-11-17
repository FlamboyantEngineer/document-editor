import type { Transaction } from 'prosemirror-state';
import { idOf, markerRanks } from '../engine/footnote-model.js';

const FOOTNOTE_PARTS = new Set(['footnote_reference', 'footnote_entry']);

/**
 * Settles the footnotes after rejecting suggestions, as each editor's footnote plugin does: the
 * entry of a marker the rejection removed goes with it, and footnote numbers, which each editor
 * sets again, are not compared. An entry that had no marker before is kept, so it still shows.
 */
export function settleRejectedFootnotes(tr: Transaction, cited: ReadonlySet<string>): void {
  const still = markerRanks(tr.doc);
  const removed: { from: number; to: number }[] = [];
  const numbered: number[] = [];
  tr.doc.descendants((node, pos) => {
    if (!FOOTNOTE_PARTS.has(node.type.name)) return !node.isText;
    const id = idOf(node);
    if (node.type.name === 'footnote_entry' && id && cited.has(id) && !still.has(id))
      removed.push({ from: pos, to: pos + node.nodeSize });
    else if (node.attrs.footnoteNumber !== null) numbered.push(pos);
    return false;
  });
  for (const pos of numbered) tr.setNodeAttribute(pos, 'footnoteNumber', null);
  for (const { from, to } of removed.reverse()) tr.delete(from, to);
}

/** The ids of the footnotes a document's markers cite. */
export const citedFootnotes = (tr: Transaction): ReadonlySet<string> =>
  new Set(markerRanks(tr.doc).keys());
