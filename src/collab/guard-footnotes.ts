import type { Node } from 'prosemirror-model';
import type { Transaction } from 'prosemirror-state';
import { idOf, markerRanks, numberingRanks } from '../engine/footnote-model.js';

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

// Each footnote marker and entry of a document, in order, with its number.
function numbered(doc: Node): { key: string; id: string | null; number: unknown }[] {
  const seen = new Map<string, number>();
  const found: { key: string; id: string | null; number: unknown }[] = [];
  doc.descendants((node) => {
    if (!FOOTNOTE_PARTS.has(node.type.name)) return !node.isText;
    const id = idOf(node);
    const base = `${node.type.name}:${id ?? ''}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    found.push({ key: `${base}:${String(count)}`, id, number: node.attrs.footnoteNumber });
    return false;
  });
  return found;
}

/**
 * Whether every footnote number a change sets is one the editors' numbering gives: the footnote's
 * place through the document or within its section, or none for a footnote no marker cites.
 */
export function hasFootnoteNumbering(before: Node, after: Node): boolean {
  const previous = new Map(numbered(before).map((part) => [part.key, part.number]));
  const ranks = [numberingRanks(after, undefined), numberingRanks(after, 'section')];
  return numbered(after).every(({ key, id, number }) => {
    if (previous.has(key) && previous.get(key) === number) return true;
    return ranks.some((rank) => {
      const at = id === null ? undefined : rank.get(id);
      return number === (at === undefined ? null : at + 1);
    });
  });
}
