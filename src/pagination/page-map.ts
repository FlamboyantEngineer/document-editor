// The layout of a paged document: its pages in order, which page holds a canonical position or an
// element, and positions between the paged projection and the canonical whole document it shows.
// The page transform that joins the projection's pages into the canonical document gives the
// position maps; positions it moves or drops are found again (`mapPosition`). The transform
// runs only once a position is mapped, so reading the pages alone costs one walk of the pages.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { EditorState } from 'prosemirror-state';
import { FRAGMENT_RULES, type FragmentRules, joinDocumentPages } from '../model/index.js';
import { mapPosition, type PagePositions, textSide } from './page-positions.js';

/** A page of the paged projection. */
export interface LaidOutPage {
  /** Its number through the document, from 1. */
  readonly number: number;
  /** The section it is a page of, by its index among the document's sections, from 0. */
  readonly section: number;
  /** Where the page node starts in the projection. */
  readonly pos: number;
  readonly node: ProseMirrorNode;
}

/** A paged document's layout, and the positions between its pages and its canonical document. */
export interface PageMap {
  /** The paged document the pages are read from. */
  readonly projection: ProseMirrorNode;
  /** The canonical whole document: each section on one page with whole blocks. */
  readonly canonical: ProseMirrorNode;
  /** The pages in order. */
  pages(): readonly LaidOutPage[];
  /**
   * The page holding a canonical position; null when no page does. Where a page break falls inside
   * a block, `assoc` picks the side: the page after it by default, the page before it with -1.
   */
  pageAt(pos: number, assoc?: -1 | 1): LaidOutPage | null;
  /** The first page holding the element with this id (`dataId`); null when no page does. */
  pageOf(elementId: string): LaidOutPage | null;
  /**
   * A projection position in the canonical document; null when it maps nowhere. By default a
   * position at the end of a textblock keeps to the text before it, any other to the text after it.
   */
  toCanonical(pos: number, assoc?: -1 | 1): number | null;
  /** A canonical position in the projection; where a page break falls, `assoc` picks the side. */
  toProjection(pos: number, assoc?: -1 | 1): number | null;
}

// The page maps of the documents read so far.
const maps = new WeakMap<ProseMirrorNode, PageMap>();

function readPages(projection: ProseMirrorNode): LaidOutPage[] {
  const pages: LaidOutPage[] = [];
  let section = -1;
  projection.forEach((child, offset) => {
    if (child.type.name !== 'page_section') return;
    section += 1;
    child.forEach((node, pageOffset) => {
      if (node.type.name !== 'page') return;
      pages.push({ number: pages.length + 1, section, pos: offset + 1 + pageOffset, node });
    });
  });
  return pages;
}

// The page whose node holds a projection position, by bisection over the pages in order.
function pageHolding(pages: readonly LaidOutPage[], pos: number): LaidOutPage | null {
  let low = 0;
  let high = pages.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const page = pages[middle];
    if (!page) return null;
    if (pos < page.pos) high = middle - 1;
    else if (pos >= page.pos + page.node.nodeSize) low = middle + 1;
    else return page;
  }
  return null;
}

function elementPages(pages: readonly LaidOutPage[]): Map<string, LaidOutPage> {
  const found = new Map<string, LaidOutPage>();
  for (const page of pages) {
    page.node.descendants((node) => {
      const id = node.attrs.dataId as unknown;
      if (typeof id === 'string' && id && !found.has(id)) found.set(id, page);
    });
  }
  return found;
}

/** The positions between a paged projection and its canonical document, as a projection keeps them. */
export type PagePositionMap = Pick<
  PageMap,
  'projection' | 'canonical' | 'toCanonical' | 'toProjection'
>;

// The positions of a paged document through the page transform that joins its pages, joined once
// a position is mapped.
function joinedPositions(projection: ProseMirrorNode, rules: FragmentRules): PagePositionMap {
  let joined: PagePositions | null = null;
  const join = () => {
    if (joined) return joined;
    const tr = joinDocumentPages(projection, rules);
    joined = { projection, canonical: tr.doc, forward: tr.mapping, backward: tr.mapping.invert() };
    return joined;
  };
  return {
    projection,
    get canonical() {
      return join().canonical;
    },
    toCanonical: (pos, assoc) =>
      mapPosition(join(), { pos, assoc: assoc ?? textSide(projection, pos) }, 'toCanonical'),
    toProjection: (pos, assoc = 1) => mapPosition(join(), { pos, assoc }, 'toProjection'),
  };
}

/**
 * The layout of a paged document, with positions mapped through the page transform that joins its
 * pages by `rules` (by default `FRAGMENT_RULES`), or through `positions` when they are those of
 * this document, as a projection keeps them, so no page transform runs (DOCE-PAGINATION-7.18).
 */
export function createPageMap(
  projection: ProseMirrorNode,
  rules: FragmentRules = FRAGMENT_RULES,
  positions?: PagePositionMap,
): PageMap {
  const pages = readPages(projection);
  const through =
    positions?.projection === projection ? positions : joinedPositions(projection, rules);
  let elements: Map<string, LaidOutPage> | null = null;
  return {
    projection,
    get canonical() {
      return through.canonical;
    },
    pages: () => pages,
    pageAt(pos, assoc = 1) {
      const at = through.toProjection(pos, assoc);
      return at === null ? null : pageHolding(pages, at);
    },
    pageOf(elementId) {
      elements ??= elementPages(pages);
      return elements.get(elementId) ?? null;
    },
    toCanonical: (pos, assoc) => through.toCanonical(pos, assoc),
    toProjection: (pos, assoc) => through.toProjection(pos, assoc),
  };
}

// The pages a projection shows each canonical document on, made once asked for.
const shownOnPages = new WeakMap<ProseMirrorNode, () => PageMap>();

/**
 * Records the pages a projection shows a canonical document on, for `pageMap`; with the positions
 * the projection keeps between them, when it has them. Without them, a document already recorded
 * keeps the pages it was shown on with their positions, as those pages still show it.
 */
export function showOnPages(
  canonical: ProseMirrorNode,
  {
    pages,
    rules,
    positions,
  }: {
    readonly pages: ProseMirrorNode;
    readonly rules: FragmentRules;
    readonly positions?: PagePositionMap | undefined;
  },
): void {
  if (!positions && shownOnPages.has(canonical)) return;
  let map: PageMap | null = null;
  shownOnPages.set(canonical, () => (map ??= createPageMap(pages, rules, positions)));
}

/**
 * The layout of the document a state shows: for a canonical document a projection shows, the
 * layout of the projection's pages (DOCE-PAGINATION-7.17); otherwise the document's own pages,
 * joined by `FRAGMENT_RULES`. Made once for each document.
 */
export function pageMap(state: EditorState): PageMap {
  const onPages = shownOnPages.get(state.doc);
  if (onPages) return onPages();
  const cached = maps.get(state.doc);
  if (cached) return cached;
  const map = createPageMap(state.doc, FRAGMENT_RULES);
  maps.set(state.doc, map);
  return map;
}
