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
import {
  type IncrementalResult,
  layoutSectionIncrementally,
  type SectionLayout,
} from './incremental-layout.js';
import { measureChildBlocks } from './measure-blocks.js';
import { blockMargin, type MeasureCache, measureCacheCounts } from './measure-cache.js';
import {
  type FootnoteArea,
  footnoteAreaHeight,
  footnoteAreaOf,
  measureFootnotes,
} from './measure-footnotes.js';
import type { PagesTextEngine } from './text-engine-types.js';

/**
 * A section's page height inside its margins, in CSS pixels. Its header, footer and footnotes take
 * their room from it.
 */
export type SectionPageHeight = number | ((section: ProseMirrorNode, index: number) => number);

/** The layout rules, the same for every section or by section, as a section's settings may ask. */
export type SectionLayoutRules =
  LayoutRules | ((section: ProseMirrorNode, index: number) => LayoutRules);

/** How a whole document is laid out. */
export interface DocumentLayoutOptions {
  pageHeight: SectionPageHeight;
  rules?: SectionLayoutRules | undefined;
  /** Whether footnotes are numbered, and their entries shown, through the document or per page. */
  footnoteNumbering?: 'document' | 'page' | undefined;
  scale?: number | undefined;
  cache?: MeasureCache | undefined;
  /** Receives each page laid out: the height its blocks take and the height it has for them. */
  onPage?: ((page: PageMetric) => void) | undefined;
  /**
   * Receives each section laid out, with how many of its blocks were measured in the view rather
   * than taken from the cache, and how many of its pages were laid out rather than reused.
   */
  onSection?: ((section: SectionReport) => void) | undefined;
  /** Where each section's layout is kept, so the next layout reuses the pages a change leaves. */
  memory?: LayoutMemory | undefined;
  /** Lays the blocks it can out without the DOM (`textLayout: 'pretext'`, DOCE-PAGINATION-11.1). */
  engine?: PagesTextEngine | null | undefined;
}

/** What a layout did in one section. */
export interface SectionReport {
  readonly blocksMeasured: number;
  readonly pagesLaidOut: number;
  readonly pages: number;
}

/** The sections' layouts a document was laid out with, for the next layout to reuse. */
export interface LayoutMemory {
  sections: SectionLayout[];
}

/** A memory for layouts, empty until the first. */
export function createLayoutMemory(): LayoutMemory {
  return { sections: [] };
}

/** A page as it was laid out: how much of its content height its blocks take. */
export interface PageMetric {
  /** The height its blocks take, facing margins collapsed, in unscaled CSS pixels. */
  readonly used: number;
  /** The height its blocks would take with every margin between them counted, none collapsed. */
  readonly stacked: number;
  /** The height it has for its blocks, beside its header, footer and footnotes. */
  readonly available: number;
  /** The height of each of its blocks, in order, without their margins. */
  readonly blocks: readonly number[];
  /** Where each of its blocks starts below the top of its content, in order. */
  readonly tops: readonly number[];
  /** The room its header and its footer take, with their margins. */
  readonly header: number;
  readonly footer: number;
  /** The room its footnote area takes. */
  readonly footnotes: number;
}

// Where each block starts below the top of the content, facing margins collapsed.
function blockTops(page: readonly LayoutBlock[]): number[] {
  let top = 0;
  return page.map((block, index) => {
    const previous = index > 0 ? page[index - 1] : undefined;
    if (previous) top += Math.max(previous.marginBottom, block.marginTop, 0);
    const at = top;
    top += Math.max(0, block.height);
    return at;
  });
}

// The height blocks take with every margin between them counted.
function stackedWithMargins(page: readonly LayoutBlock[]): number {
  return page.reduce(
    (sum, block, index) =>
      sum +
      Math.max(0, block.height) +
      (index > 0 ? Math.max(0, block.marginTop) : 0) +
      (index < page.length - 1 ? Math.max(0, block.marginBottom) : 0),
    0,
  );
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
  readonly header: number | null;
  readonly footer: number | null;
}

// Where each section's page content and footnote area start in a whole document.
function sectionPlaces(doc: ProseMirrorNode): SectionPlace[] {
  const places: SectionPlace[] = [];
  doc.forEach((section, offset) => {
    const page = section.type.name === 'page_section' ? section.firstChild : null;
    if (!page) return;
    const at: Record<string, number> = {};
    page.forEach((region, regionOffset) => {
      at[region.type.name] = offset + 2 + regionOffset;
    });
    const content = at.page_content;
    if (content === undefined) return;
    const [footnotes, header, footer] = [at.page_footnotes, at.page_header, at.page_footer];
    places.push({
      section,
      content,
      footnotes: footnotes ?? null,
      header: header ?? null,
      footer: footer ?? null,
    });
  });
  return places;
}

// The text each template variable in a header or footer shows, as the view draws it
// (`createPageVariables`): the engine lays the region out with these values.
function variableTexts(region: HTMLElement): ReadonlyMap<string, string> {
  const texts = new Map<string, string>();
  for (const variable of region.querySelectorAll<HTMLElement>('[data-template-variable]')) {
    texts.set(variable.dataset.templateVariable ?? '', variable.textContent);
  }
  return texts;
}

// The room a page header or footer takes, with its margins; one the view hides takes none. The
// layout engine gives it when it lays the region out (`measureRegion`), the view's box otherwise.
function regionHeight(view: EditorView, pos: number | null, at: RegionAt): number {
  const dom = pos === null ? null : view.nodeDOM(pos);
  if (!dom || dom.nodeType !== 1) return 0;
  const element = dom as HTMLElement;
  const { height } = element.getBoundingClientRect();
  if (!height) return 0;
  const node = pos === null ? null : view.state.doc.nodeAt(pos);
  const room = node ? at.engine?.measureRegion(node, at.scope, variableTexts(element)) : null;
  if (room) return room.height > 0 ? room.height + room.gap : 0;
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (!style) return height / at.ratio;
  const margins =
    (parseFloat(blockMargin(style, 'start')) || 0) + (parseFloat(blockMargin(style, 'end')) || 0);
  return height / at.ratio + margins;
}

// Where a section's regions are measured: at the view's scale, or by the layout engine in a scope.
interface RegionAt {
  readonly ratio: number;
  readonly scope: string | null;
  readonly engine: PagesTextEngine | null | undefined;
}

// A section's footnote area, laid out by the layout engine when it can, else measured in the view.
function footnoteArea(view: EditorView, pos: number | null, at: RegionAt): FootnoteArea | null {
  if (pos === null) return null;
  const node = view.state.doc.nodeAt(pos);
  const room = node ? at.engine?.measureRegion(node, at.scope) : null;
  if (node && room) return footnoteAreaOf(node, room);
  return measureFootnotes(view, pos, { scale: at.ratio });
}

interface SectionFill {
  readonly blocks: LayoutBlock[];
  readonly area: FootnoteArea | null;
  readonly baseHeight: number;
  /** The room the header and the footer take. */
  readonly regions: { readonly header: number; readonly footer: number };
  /** Footnotes whose entries an earlier page holds. */
  readonly shown: Set<string>;
}

// What a section's page heights depend on besides its blocks, as a key.
function fillKey(fill: SectionFill, perPage: boolean): string {
  const last = fill.area?.last;
  const entries = fill.area
    ? [...fill.area.entries].map(([id, height]) => `${id}:${height}:${last?.get(id) ?? ''}`)
    : [];
  return [fill.baseHeight, perPage, fill.area?.overhead ?? '-', ...entries].join('|');
}

function layoutSection(
  fill: SectionFill,
  options: Omit<DocumentLayoutOptions, 'rules'> & { readonly rules?: LayoutRules | undefined },
  previous: SectionLayout | undefined,
): IncrementalResult {
  const perPage = options.footnoteNumbering === 'page';
  const { area, shown, baseHeight } = fill;
  const pageHeight = (blocks: readonly LayoutBlock[]) => {
    if (!area) return baseHeight;
    const fresh = [...cited(blocks)].filter((id) => perPage || !shown.has(id));
    return baseHeight - footnoteAreaHeight(area, fresh);
  };
  return layoutSectionIncrementally({
    blocks: fill.blocks,
    key: fillKey(fill, perPage),
    previous,
    // With footnotes numbered through the document, a page's room depends on those shown before.
    state: () => (area && !perPage ? [...shown].join(' ') : ''),
    next: (queue, index) => layoutNextPage(queue, index, { pageHeight, rules: options.rules }),
    page(page) {
      const available = pageHeight(page);
      options.onPage?.({
        used: stackedHeight(page),
        stacked: stackedWithMargins(page),
        available,
        blocks: page.map((block) => block.height),
        tops: blockTops(page),
        ...fill.regions,
        footnotes: baseHeight - available,
      });
      for (const id of cited(page)) shown.add(id);
    },
  });
}

/**
 * The pages of each section of the whole document a view renders, as `projectDocument` takes them:
 * every block measured, cached ones reused, and each page short by its header's, its footer's and
 * its footnote entries' heights.
 */
export function layoutDocument(view: EditorView, options: DocumentLayoutOptions): SectionPages[] {
  const { scale, cache, memory } = options;
  const ratio = scale && scale > 0 ? scale : 1;
  const shown = new Set<string>();
  const measuredSoFar = () => (cache ? measureCacheCounts(cache).measured : 0);
  const places = sectionPlaces(view.state.doc);
  const { engine } = options;
  engine?.number(view.state.doc);
  const sections = places.map(({ section, content, footnotes, header, footer }, index) => {
    const height = options.pageHeight;
    const pageHeight = typeof height === 'function' ? height(section, index) : height;
    const scope = (section.attrs.sectionName as string | null | undefined) ?? null;
    const at = { ratio, scope, engine };
    const regions = {
      header: regionHeight(view, header, at),
      footer: regionHeight(view, footer, at),
    };
    const before = measuredSoFar();
    const rules =
      typeof options.rules === 'function' ? options.rules(section, index) : options.rules;
    const laid = engine ? (node: ProseMirrorNode) => engine.measureBlock(node, scope) : undefined;
    const blocks = measureChildBlocks(view, content, { scale, cache, rules, engine: laid });
    const blocksMeasured = cache ? measuredSoFar() - before : blocks.length;
    const area = footnoteArea(view, footnotes, at);
    const baseHeight = pageHeight - regions.header - regions.footer;
    const fill = { blocks, area, baseHeight, regions, shown };
    const result = layoutSection(fill, { ...options, rules }, memory?.sections[index]);
    const { pagesLaidOut, pages } = result;
    options.onSection?.({ blocksMeasured, pagesLaidOut, pages: pages.length });
    return result;
  });
  if (memory) memory.sections = sections.map((result) => result.layout);
  return sections.map(({ pages }) => pages.map((page) => page.map((block) => block.node)));
}
