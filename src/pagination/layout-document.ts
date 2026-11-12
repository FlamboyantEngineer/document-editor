// Lays a whole document out on pages from a view that renders it: each section's blocks measured,
// and each page left the room its header and footer and the footnote entries it will hold take.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';
import {
  type LayoutBlock,
  layoutNextPage,
  type LayoutRules,
  type SectionPages,
  stackedHeight,
} from '../model/index.js';
import { type MeasureCache, measureCacheCounts, measureChildBlocks } from './measure-blocks.js';
import { type FootnoteArea, footnoteAreaHeight, measureFootnotes } from './measure-footnotes.js';

/**
 * A section's page height inside its margins, in CSS pixels. Its header, footer and footnotes take
 * their room from it.
 */
export type SectionPageHeight = number | ((section: ProseMirrorNode, index: number) => number);

/** How a whole document is laid out. */
export interface DocumentLayoutOptions {
  pageHeight: SectionPageHeight;
  rules?: LayoutRules | undefined;
  /** Whether footnotes are numbered, and their entries shown, through the document or per page. */
  footnoteNumbering?: 'document' | 'page' | undefined;
  scale?: number | undefined;
  cache?: MeasureCache | undefined;
  /** Receives each page laid out: the height its blocks take and the height it has for them. */
  onPage?: ((page: PageMetric) => void) | undefined;
  /**
   * Receives each section laid out, with how many of its blocks were measured in the view rather
   * than taken from the cache.
   */
  onSection?: ((section: { readonly blocksMeasured: number }) => void) | undefined;
}

/** A page as it was laid out: how much of its content height its blocks take. */
export interface PageMetric {
  /** The height its blocks take, in unscaled CSS pixels. */
  readonly used: number;
  /** The height it has for its blocks, beside its header, footer and footnotes. */
  readonly available: number;
  /** The height of each of its blocks, in order, without their margins. */
  readonly blocks: readonly number[];
}

const citations = new WeakMap<ProseMirrorNode, readonly string[]>();

function citedIn(node: ProseMirrorNode): readonly string[] {
  const known = citations.get(node);
  if (known) return known;
  const ids: string[] = [];
  node.descendants((child) => {
    const id = child.attrs.footnoteId as unknown;
    if (child.type.name === 'footnote_reference' && typeof id === 'string' && id) ids.push(id);
  });
  citations.set(node, ids);
  return ids;
}

function cited(blocks: readonly LayoutBlock[]): Set<string> {
  return new Set(blocks.flatMap((block) => citedIn(block.node)));
}

interface SectionPlace {
  readonly section: ProseMirrorNode;
  readonly content: number;
  readonly footnotes: number | null;
  /** The header's and footer's positions. */
  readonly regions: number[];
}

// Where each section's page content and footnote area start in a whole document.
function sectionPlaces(doc: ProseMirrorNode): SectionPlace[] {
  const places: SectionPlace[] = [];
  doc.forEach((section, offset) => {
    const page = section.type.name === 'page_section' ? section.firstChild : null;
    if (!page) return;
    let content: number | null = null;
    let footnotes: number | null = null;
    const regions: number[] = [];
    page.forEach((region, regionOffset) => {
      const pos = offset + 2 + regionOffset;
      const name = region.type.name;
      if (name === 'page_content') content = pos;
      if (name === 'page_footnotes') footnotes = pos;
      if (name === 'page_header' || name === 'page_footer') regions.push(pos);
    });
    if (content !== null) places.push({ section, content, footnotes, regions });
  });
  return places;
}

// The room a page header or footer takes, with its margins; one the view hides takes none.
function regionHeight(view: EditorView, pos: number, ratio: number): number {
  const dom = view.nodeDOM(pos);
  if (!dom || dom.nodeType !== 1) return 0;
  const element = dom as HTMLElement;
  const { height } = element.getBoundingClientRect();
  if (!height) return 0;
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (!style) return height / ratio;
  const margins = (parseFloat(style.marginTop) || 0) + (parseFloat(style.marginBottom) || 0);
  return height / ratio + margins;
}

interface SectionFill {
  readonly blocks: LayoutBlock[];
  readonly area: FootnoteArea | null;
  readonly baseHeight: number;
  /** Footnotes whose entries an earlier page holds. */
  readonly shown: Set<string>;
}

function layoutSection(fill: SectionFill, options: DocumentLayoutOptions): SectionPages {
  const perPage = options.footnoteNumbering === 'page';
  const { area, shown, baseHeight } = fill;
  const pageHeight = (blocks: readonly LayoutBlock[]) => {
    if (!area) return baseHeight;
    const fresh = [...cited(blocks)].filter((id) => perPage || !shown.has(id));
    return baseHeight - footnoteAreaHeight(area, fresh);
  };
  const queue = [...fill.blocks];
  const pages: ProseMirrorNode[][] = [];
  while (queue.length) {
    const page = layoutNextPage(queue, pages.length, { pageHeight, rules: options.rules });
    options.onPage?.({
      used: stackedHeight(page),
      available: pageHeight(page),
      blocks: page.map((block) => block.height),
    });
    for (const id of cited(page)) shown.add(id);
    pages.push(page.map((block) => block.node));
  }
  return pages;
}

/**
 * The pages of each section of the whole document a view renders, as `projectDocument` takes them:
 * every block measured, cached ones reused, and each page short by its header's, its footer's and
 * its footnote entries' heights.
 */
export function layoutDocument(view: EditorView, options: DocumentLayoutOptions): SectionPages[] {
  const { scale, cache } = options;
  const ratio = scale && scale > 0 ? scale : 1;
  const shown = new Set<string>();
  const measuredSoFar = () => (cache ? measureCacheCounts(cache).measured : 0);
  return sectionPlaces(view.state.doc).map(({ section, content, footnotes, regions }, index) => {
    const height = options.pageHeight;
    const pageHeight = typeof height === 'function' ? height(section, index) : height;
    const regionsHeight = regions.reduce((sum, pos) => sum + regionHeight(view, pos, ratio), 0);
    const baseHeight = pageHeight - regionsHeight;
    const before = measuredSoFar();
    const blocks = measureChildBlocks(view, content, { scale, cache, rules: options.rules });
    options.onSection?.({ blocksMeasured: cache ? measuredSoFar() - before : blocks.length });
    return layoutSection(
      {
        blocks,
        area: footnotes === null ? null : measureFootnotes(view, footnotes, { scale }),
        baseHeight,
        shown,
      },
      options,
    );
  });
}
