// Keeping each footnote's marker and entry together after a change: one entry per marker, in its
// page's footnote area, in marker order. A cut entry's text is kept, so a pasted marker gets it back,
// and a copied marker becomes a footnote of its own with a copy of the text.

import { Fragment, type Node as ProseMirrorNode } from 'prosemirror-model';
import type { Transaction } from 'prosemirror-state';
import { Mapping } from 'prosemirror-transform';
import {
  footnoteAreaAt,
  type FootnoteAt,
  idOf,
  isFootnoteMarker,
  listFootnotes,
} from './footnote-model.js';

/** What a reconcile reads besides the document. */
export interface FootnoteReconcileContext {
  /** The document before the changes, and the changes, to tell an original marker from a copy. */
  readonly before: ProseMirrorNode;
  readonly transactions: readonly Transaction[];
  /** The text of entries cut earlier, by footnote id. */
  readonly bodies: ReadonlyMap<string, Fragment>;
  readonly newId: () => string;
}

interface Placed {
  readonly id: string;
  readonly pos: number;
  readonly node: ProseMirrorNode;
}

interface Scan {
  readonly markers: Placed[];
  readonly entries: Map<string, Placed[]>;
  readonly areas: { readonly pos: number; readonly node: ProseMirrorNode }[];
}

// Every marker and entry in document order, and every footnote area, in one walk.
function scan(doc: ProseMirrorNode): Scan {
  const found: Scan = { markers: [], entries: new Map(), areas: [] };
  doc.descendants((node, pos) => {
    if (node.type.name === 'page_footnotes') found.areas.push({ pos, node });
    const id = idOf(node);
    if (isFootnoteMarker(node) && id) found.markers.push({ id, pos, node });
    if (node.type.name === 'footnote_entry' && id)
      found.entries.set(id, [...(found.entries.get(id) ?? []), { id, pos, node }]);
    return true;
  });
  return found;
}

// The marker of each id that was there before the changes: the one at the old marker's place.
function originalMarkers(scanned: Scan, context: FootnoteReconcileContext): Set<Placed> {
  const counts = new Map<string, number>();
  for (const marker of scanned.markers) counts.set(marker.id, (counts.get(marker.id) ?? 0) + 1);
  const keep = new Set<Placed>();
  const repeated = [...counts].filter(([, count]) => count > 1).map(([id]) => id);
  const old: Map<string, FootnoteAt> = repeated.length ? listFootnotes(context.before) : new Map();
  const mapping = new Mapping();
  for (const tr of context.transactions) mapping.appendMapping(tr.mapping);
  for (const id of new Set(scanned.markers.map((marker) => marker.id))) {
    const same = scanned.markers.filter((marker) => marker.id === id);
    const before = old.get(id)?.marker ?? null;
    const at = before === null ? null : mapping.map(before, 1);
    keep.add(same.find((marker) => marker.pos === at) ?? (same[0] as Placed));
  }
  return keep;
}

interface Missing {
  readonly id: string;
  readonly area: number | null;
  readonly body: Fragment;
}

// Each marker's rank, a new id for each copied one, and the entries the markers lack.
function rankMarkers(tr: Transaction, scanned: Scan, context: FootnoteReconcileContext) {
  const originals = originalMarkers(scanned, context);
  const ranks = new Map<string, number>();
  const missing: Missing[] = [];
  for (const marker of scanned.markers) {
    const entry = scanned.entries.get(marker.id)?.[0];
    const id = originals.has(marker) ? marker.id : context.newId();
    if (id !== marker.id)
      tr.setNodeMarkup(marker.pos, undefined, { ...marker.node.attrs, footnoteId: id });
    if (!ranks.has(id)) ranks.set(id, ranks.size);
    if (entry && id === marker.id) continue;
    const body = entry?.node.content ?? context.bodies.get(marker.id) ?? Fragment.empty;
    missing.push({ id, area: footnoteAreaAt(tr.doc, marker.pos), body });
  }
  return { ranks, missing };
}

// A footnote area's entries: the first entry of each cited footnote and the missing ones, in rank.
function areaContent(
  area: Scan['areas'][number],
  { scanned, ranks, missing }: { scanned: Scan; ranks: Map<string, number>; missing: Missing[] },
): Fragment {
  const listed: ProseMirrorNode[] = [];
  area.node.forEach((entry, offset) => {
    const id = idOf(entry);
    const first = id ? scanned.entries.get(id)?.[0] : undefined;
    if (id && ranks.has(id) && first?.pos === area.pos + 1 + offset) listed.push(entry);
  });
  const entryType = area.node.type.schema.nodes.footnote_entry;
  for (const add of missing.filter((item) => item.area === area.pos))
    if (entryType) listed.push(entryType.create({ footnoteId: add.id }, add.body));
  const rank = (node: ProseMirrorNode) => ranks.get(idOf(node) ?? '') ?? ranks.size;
  return Fragment.from(listed.sort((a, b) => rank(a) - rank(b)));
}

/**
 * Puts the footnotes back in order: an entry whose marker is gone is removed and its text kept, a
 * marker with no entry gets one (with its kept text, if any), a copied marker gets a new id and a
 * copy of the text, an entry repeated for one id is removed, and each footnote area lists its entries
 * in marker order. Returns whether it changed the document, and the text it kept.
 */
export function reconcileFootnotes(
  tr: Transaction,
  context: FootnoteReconcileContext,
): { readonly changed: boolean; readonly kept: Map<string, Fragment> } {
  const scanned = scan(tr.doc);
  const { ranks, missing } = rankMarkers(tr, scanned, context);
  const kept = new Map<string, Fragment>();
  for (const [id, entries] of scanned.entries) {
    if (!ranks.has(id) && entries[0]) kept.set(id, entries[0].node.content);
  }
  let changed = tr.docChanged;
  for (const area of [...scanned.areas].reverse()) {
    const content = areaContent(area, { scanned, ranks, missing });
    if (content.eq(area.node.content)) continue;
    tr.replaceWith(area.pos + 1, area.pos + area.node.nodeSize - 1, content);
    changed = true;
  }
  return { changed, kept };
}
