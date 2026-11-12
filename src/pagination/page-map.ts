// The layout of a paged document: its pages in order, which page holds a canonical position or an
// element, and positions between the paged projection and the canonical whole document it shows.
// The page transform that joins the projection's pages into the canonical document gives the
// position maps; positions it moves or drops are found again (`redirectPosition`). The transform
// runs only once a position is mapped, so reading the pages alone costs one walk of the pages.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { EditorState } from 'prosemirror-state';
import type { Mapping } from 'prosemirror-transform';
import { FRAGMENT_RULES, type FragmentRules, joinDocumentPages } from '../model/index.js';
import { type MapDirection, redirectPosition } from './page-map-redirects.js';
import { paginationKey } from './pagination.js';

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

// The page maps of the documents read so far, with the fragment rules each was joined by.
const maps = new WeakMap<
  ProseMirrorNode,
  { readonly rules: FragmentRules; readonly map: PageMap }
>();

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

// -1 at the end of a textblock, so the position keeps to the text before it; otherwise 1.
function side(doc: ProseMirrorNode, pos: number): -1 | 1 {
  const $pos = doc.resolve(pos);
  return $pos.parent.isTextblock && $pos.parentOffset === $pos.parent.content.size ? -1 : 1;
}

/**
 * The layout of a paged document, with positions mapped through the page transform that joins its
 * pages by `rules` (by default `FRAGMENT_RULES`).
 */
export function createPageMap(
  projection: ProseMirrorNode,
  rules: FragmentRules = FRAGMENT_RULES,
): PageMap {
  const pages = readPages(projection);
  let joined: { canonical: ProseMirrorNode; forward: Mapping; backward: Mapping } | null = null;
  let elements: Map<string, LaidOutPage> | null = null;
  const join = () => {
    if (joined) return joined;
    const tr = joinDocumentPages(projection, rules);
    joined = { canonical: tr.doc, forward: tr.mapping, backward: tr.mapping.invert() };
    return joined;
  };
  const map = (pos: number, assoc: -1 | 1, direction: MapDirection): number | null => {
    const { canonical, forward, backward } = join();
    const toCanonical = direction === 'toCanonical';
    const result = (toCanonical ? forward : backward).mapResult(pos, assoc);
    if (!result.deletedAcross) return result.pos;
    const [from, to] = toCanonical ? [projection, canonical] : [canonical, projection];
    return redirectPosition({ $pos: from.resolve(pos), to, direction, forward });
  };
  const toProjection = (pos: number, assoc: -1 | 1 = 1) => map(pos, assoc, 'toProjection');
  return {
    projection,
    get canonical() {
      return join().canonical;
    },
    pages: () => pages,
    pageAt(pos, assoc = 1) {
      const at = toProjection(pos, assoc);
      return at === null ? null : pageHolding(pages, at);
    },
    pageOf(elementId) {
      elements ??= elementPages(pages);
      return elements.get(elementId) ?? null;
    },
    toCanonical: (pos, assoc) => map(pos, assoc ?? side(projection, pos), 'toCanonical'),
    toProjection,
  };
}

/**
 * The layout of the document a state shows, joined by its pagination's fragment rules, or by
 * `FRAGMENT_RULES` with none. Made once for each document and set of rules.
 */
export function pageMap(state: EditorState): PageMap {
  const plugin = paginationKey.get(state);
  const rules = (plugin?.spec.fragmentRules as FragmentRules | undefined) ?? FRAGMENT_RULES;
  const cached = maps.get(state.doc);
  if (cached?.rules === rules) return cached.map;
  const map = createPageMap(state.doc, rules);
  maps.set(state.doc, { rules, map });
  return map;
}
