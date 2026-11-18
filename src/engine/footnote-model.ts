// What the footnote commands and plugin share: finding markers and entries, their order, the places
// a footnote may be cited, the footnote area of a page, and the plugin's state.

import { Fragment, type Node as ProseMirrorNode, type ResolvedPos } from 'prosemirror-model';
import { type EditorState, PluginKey } from 'prosemirror-state';
import { regionBeside, regionKind } from '../model/index.js';

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
  /** Where the reader was taken to; null forgets it, as a brief highlight ends. */
  readonly reveal?: FootnoteRevealed | null | undefined;
  /** Set on the plugin's own reconcile, which needs no reconcile of its own. */
  readonly reconciled?: boolean | undefined;
}

/**
 * The blocks a citing paragraph or caption may sit in, from its parent up to the page's content:
 * lists, table cells, header cells too, figures, the node that holds a table with its caption,
 * quotes and layout columns. Script output and footnote entries are left out.
 */
export const defaultCitingPlaces: readonly string[] = Object.freeze([
  'list_item',
  'bullet_list',
  'ordered_list',
  'figure',
  'table_figure',
  'table',
  'table_row',
  'table_cell',
  'table_header',
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

/** The footnote entries, of those given, that content cites: those with a marker in it. */
export function citedEntries(entries: Fragment, content: Fragment): Fragment {
  const cited = new Set<string>();
  content.descendants((node) => {
    const id = isFootnoteMarker(node) ? idOf(node) : null;
    if (id) cited.add(id);
  });
  const kept: ProseMirrorNode[] = [];
  entries.forEach((entry) => {
    if (cited.has(idOf(entry) ?? '')) kept.push(entry);
  });
  return Fragment.from(kept);
}

/** The position of the footnote area beside a position (`regionBeside`), or null. */
export function footnoteAreaAt(doc: ProseMirrorNode, pos: number): number | null {
  return regionBeside(doc.resolve(pos), 'footnotes')?.pos ?? null;
}

/** The places a footnote may be cited in, as the footnote plugin was given them. */
export function citingPlacesOf(state: EditorState): ReadonlySet<string> {
  return footnotesKey.getState(state)?.places ?? new Set(defaultCitingPlaces);
}

// Whether the blocks around a position, from a depth up to the page's content, are all places a
// footnote may be cited in.
function inCitingPlaces($pos: ResolvedPos, from: number, places: ReadonlySet<string>): boolean {
  for (let depth = from; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    if (regionKind(node) === 'content') return true;
    if (!places.has(node.type.name)) return false;
  }
  return false;
}

/**
 * Whether a text block may hold a footnote's marker: a paragraph, or a figure's or table's caption
 * other than the one the pages repeat on a table's later part, which is not edited.
 */
export function isCitingBlock(node: ProseMirrorNode): boolean {
  const name = node.type.name;
  if (name === 'figure_caption') return true;
  if (name === 'table_caption') return !node.attrs.continuedText;
  return name === 'paragraph';
}

/** Whether a footnote may be cited at a position: in a citing block of the body, in its places. */
function canCiteAt($pos: ResolvedPos, places: ReadonlySet<string>): boolean {
  return isCitingBlock($pos.parent) && inCitingPlaces($pos, $pos.depth - 1, places);
}

/**
 * Whether a paragraph beside the block a position is in may cite a footnote: where the whole
 * blocks of pasted content land.
 */
export function canCiteBeside($pos: ResolvedPos, places: ReadonlySet<string>): boolean {
  return inCitingPlaces($pos, $pos.parent.isTextblock ? $pos.depth - 1 : $pos.depth, places);
}

/** Whether the selection is where a footnote may be cited (`canCiteAt`). */
export function canInsertFootnote(state: EditorState): boolean {
  const { footnote_reference: marker, footnote_entry: entry } = state.schema.nodes;
  return Boolean(marker && entry) && canCiteAt(state.selection.$from, citingPlacesOf(state));
}
