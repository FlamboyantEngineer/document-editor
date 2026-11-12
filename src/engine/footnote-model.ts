// What the footnote commands and plugin share: finding markers and entries, their order, the places
// a footnote may be cited, the footnote area of a page, and the plugin's state.

import type { Fragment, Node as ProseMirrorNode, ResolvedPos } from 'prosemirror-model';
import { type EditorState, PluginKey, type Transaction } from 'prosemirror-state';

/** Where a footnote is, its marker in the text and its entry. */
export interface FootnoteAt {
  readonly id: string;
  readonly marker: number | null;
  readonly entry: number | null;
}

/** The part of a footnote a reader was taken to, and its position. */
export interface FootnoteRevealed {
  readonly id: string;
  readonly part: 'marker' | 'entry';
  readonly pos: number;
}

/** The footnote plugin's state. */
export interface FootnotesPluginState {
  readonly places: ReadonlySet<string>;
  /** The text of entries whose markers were cut, by footnote id, to give back when one returns. */
  readonly bodies: ReadonlyMap<string, Fragment>;
  readonly revealed: FootnoteRevealed | null;
}

/** What a transaction tells the footnote plugin. */
export interface FootnotesMeta {
  readonly bodies?: ReadonlyMap<string, Fragment> | undefined;
  readonly reveal?: FootnoteRevealed | undefined;
  /** Set on the plugin's own reconcile, which needs no reconcile of its own. */
  readonly reconciled?: boolean | undefined;
}

/**
 * The blocks a citing paragraph may sit in, from the paragraph's parent up to the page's content:
 * lists, body cells, quotes and layout columns. Header cells, script output and footnote entries are
 * left out.
 */
export const defaultCitingPlaces: readonly string[] = Object.freeze([
  'list_item',
  'bullet_list',
  'ordered_list',
  'table',
  'table_row',
  'table_cell',
  'blockquote',
  'layout_section',
  'layout_column',
]);

export const footnotesKey = new PluginKey<FootnotesPluginState>('footnotes');

/** The footnote id a marker or entry carries, or null. */
export const idOf = (node: ProseMirrorNode): string | null => {
  const id = node.attrs.footnoteId as unknown;
  return typeof id === 'string' && id ? id : null;
};

export const isFootnoteMarker = (node: ProseMirrorNode | null | undefined): boolean =>
  node?.type.name === 'footnote_reference';

/** Each footnote of a document, by id, with the positions of its marker and its entry. */
export function listFootnotes(doc: ProseMirrorNode): Map<string, FootnoteAt> {
  const found = new Map<string, { marker: number | null; entry: number | null }>();
  doc.descendants((node, pos) => {
    const name = node.type.name;
    if (name !== 'footnote_reference' && name !== 'footnote_entry') return !node.isText;
    const id = idOf(node);
    if (!id) return false;
    const at = found.get(id) ?? { marker: null, entry: null };
    if (name === 'footnote_reference' && at.marker === null) at.marker = pos;
    if (name === 'footnote_entry' && at.entry === null) at.entry = pos;
    found.set(id, at);
    return false;
  });
  return new Map([...found].map(([id, at]) => [id, { id, ...at }]));
}

/** Each cited footnote's rank, from 0, in the order of the markers' first citations. */
export function markerRanks(doc: ProseMirrorNode): Map<string, number> {
  const ranks = new Map<string, number>();
  doc.descendants((node) => {
    if (!isFootnoteMarker(node)) return !node.isText && !node.isAtom;
    const id = idOf(node);
    if (id && !ranks.has(id)) ranks.set(id, ranks.size);
    return false;
  });
  return ranks;
}

/** Numbers every footnote marker and entry in document order; returns whether any changed. */
export function numberFootnotes(tr: Transaction): boolean {
  const ranks = markerRanks(tr.doc);
  let changed = false;
  tr.doc.descendants((node, pos) => {
    const name = node.type.name;
    if (name !== 'footnote_reference' && name !== 'footnote_entry') return !node.isText;
    const id = idOf(node);
    const rank = id ? ranks.get(id) : undefined;
    const number = rank === undefined ? null : rank + 1;
    if (node.attrs.footnoteNumber !== number) {
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, footnoteNumber: number });
      changed = true;
    }
    return false;
  });
  return changed;
}

/** The position of the footnote area of the page holding a position, or null. */
export function footnoteAreaAt(doc: ProseMirrorNode, pos: number): number | null {
  const $pos = doc.resolve(pos);
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    if (node.type.name !== 'page') continue;
    let area: number | null = null;
    node.forEach((region, offset) => {
      if (region.type.name === 'page_footnotes') area = $pos.start(depth) + offset;
    });
    return area;
  }
  return null;
}

/** The places a footnote may be cited in, as the footnote plugin was given them. */
export function citingPlacesOf(state: EditorState): ReadonlySet<string> {
  return footnotesKey.getState(state)?.places ?? new Set(defaultCitingPlaces);
}

/** Whether a footnote may be cited at a position: in a paragraph of the page's body, in its places. */
export function canCiteAt($pos: ResolvedPos, places: ReadonlySet<string>): boolean {
  if ($pos.parent.type.name !== 'paragraph') return false;
  for (let depth = $pos.depth - 1; depth > 0; depth -= 1) {
    const name = $pos.node(depth).type.name;
    if (name === 'page_content') return true;
    if (!places.has(name)) return false;
  }
  return false;
}

/** Whether the selection is where a footnote may be cited (`canCiteAt`). */
export function canInsertFootnote(state: EditorState): boolean {
  const { footnote_reference: marker, footnote_entry: entry } = state.schema.nodes;
  return Boolean(marker && entry) && canCiteAt(state.selection.$from, citingPlacesOf(state));
}
