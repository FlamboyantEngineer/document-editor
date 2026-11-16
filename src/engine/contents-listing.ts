// What a contents plugin keeps for a document: its catalog and where its lists are, derived from
// the listing before a text edit or counted once read, and each list's rows as decorations.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { Transaction } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { deriveCatalog } from '../model/contents/catalog-derive.js';
import {
  catalogDocument,
  type ContentsKind,
  type DocumentCatalog,
  type TemplateFile,
} from '../model/index.js';
import { hasContents } from './contents-presence.js';
import type { ContentsRows } from './contents-view.js';

/** What a contents plugin keeps: the catalog, and the rows each list block shows. */
export interface ContentsState {
  readonly catalog: DocumentCatalog;
  readonly decorations: DecorationSet;
  /**
   * How many times the plugin has counted a whole document for its catalog; an edit of a heading's
   * or a paragraph's text derives the catalog from the one before it and counts nothing.
   */
  readonly builds: number;
}

// The kinds a contents plugin lists, and the one a list block names.
export interface Kinds {
  readonly all: Readonly<Record<string, ContentsKind>>;
  readonly of: (node: ProseMirrorNode) => string;
}

// The entries a list block shows: those of its kind down to its deepest level, in the range a
// split part holds.
function rowsOf(
  node: ProseMirrorNode,
  { catalog, kinds }: { catalog: DocumentCatalog; kinds: Kinds },
): ContentsRows {
  const key = kinds.of(node);
  const deepest = Number(node.attrs.minLevel) || 6;
  const listed = (catalog[key] ?? []).filter((entry) => entry.level <= deepest);
  const start = Number(node.attrs.entryStart) || 0;
  const end = Number.isInteger(node.attrs.entryEnd) ? Number(node.attrs.entryEnd) : listed.length;
  return {
    entries: listed.slice(start, end),
    empty: listed.length === 0,
    showPage: kinds.all[key]?.showPage !== false,
    separator: kinds.all[key]?.separator ?? '',
  };
}

// Each list's rows, the first row of each anchor alone carrying it, so a second list of the same
// kind repeats no element id.
export function decorate(doc: ProseMirrorNode, listing: Listing, kinds: Kinds): DecorationSet {
  const taken = new Set<string>();
  const decorations = listing.lists.flatMap((pos) => {
    const node = doc.nodeAt(pos);
    if (node?.type.name !== 'toc_block') return [];
    const rows = rowsOf(node, { catalog: listing.catalog, kinds });
    const entries = rows.entries.map((entry) => {
      if (!entry.anchor) return entry;
      if (!taken.has(entry.anchor)) {
        taken.add(entry.anchor);
        return entry;
      }
      const { anchor: _anchor, ...rest } = entry;
      return rest;
    });
    return [Decoration.node(pos, pos + node.nodeSize, {}, { contents: { ...rows, entries } })];
  });
  return DecorationSet.create(doc, decorations);
}

/** A document's catalog and where its lists of contents are. */
interface Listing {
  readonly catalog: DocumentCatalog;
  readonly lists: readonly number[];
}

// How many changes a listing is derived through before the document is counted again.
const LINEAGE = 16;

// Counts a document: its catalog and its lists.
function countListing(doc: ProseMirrorNode, template: TemplateFile, kinds: Kinds): Listing {
  const lists: number[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === 'toc_block') lists.push(pos);
    return !node.isTextblock;
  });
  return { catalog: catalogDocument(doc, template, kinds.all), lists };
}

/** What a contents plugin keeps: the catalog, and the rows each list block shows. */
export interface InnerState extends ContentsState {
  readonly listing: Listing;
  /** How many listings back the one it derives from was counted. */
  readonly depth: number;
}

interface StateSource {
  readonly doc: ProseMirrorNode;
  readonly template: TemplateFile;
  readonly kinds: Kinds;
  /** How many times the plugin counted a document. */
  readonly counter: { builds: number };
  /** The state before a change and the change, for a listing to derive from. */
  readonly from?: { state: InnerState; tr: Transaction } | undefined;
}

// The listing after a change, derived from the one before it, or null when it has to be counted.
function derived(from: StateSource['from'], kinds: Kinds): Listing | null {
  if (!from || from.state.depth >= LINEAGE) return null;
  const { tr } = from;
  const catalog = deriveCatalog(from.state.listing.catalog, tr, kinds.all);
  if (!catalog) return null;
  return { catalog, lists: from.state.listing.lists.map((pos) => tr.mapping.map(pos)) };
}

// The plugin state of a document, its listing derived from the one before a text edit or counted
// once read, and no rows to draw in a document that holds no list, so a keystroke does not count
// the whole document (DOCE-CONTENTS-2.7, 2.9).
export function stateOf(source: StateSource): InnerState {
  const { doc, template, kinds, counter } = source;
  let from = source.from;
  let listing: Listing | null = null;
  let depth = 0;
  let decorations: DecorationSet | null = null;
  const listed = (): Listing => {
    if (listing) return listing;
    const derivedListing = derived(from, kinds);
    if (derivedListing && from) depth = from.state.depth + 1;
    else counter.builds += 1;
    listing = derivedListing ?? countListing(doc, template, kinds);
    from = undefined;
    return listing;
  };
  return {
    get listing() {
      return listed();
    },
    get depth() {
      listed();
      return depth;
    },
    get catalog() {
      return listed().catalog;
    },
    get builds() {
      return counter.builds;
    },
    get decorations() {
      decorations ??= hasContents(doc) ? decorate(doc, listed(), kinds) : DecorationSet.empty;
      return decorations;
    },
  };
}
