// Lays a whole document out on pages from a state that holds it: each section's blocks laid out by
// the pages' text layout engine, with no DOM, and each page left the room its header and footer
// and the footnote entries it will hold take.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { EditorState } from 'prosemirror-state';
import { hasContents } from '../engine/contents-presence.js';
import {
  type LayoutBlock,
  layoutNextPage,
  type LayoutRules,
  type SectionPages,
  stackedHeight,
} from '../model/index.js';
import { hasBodyPageVariable } from './body-variables.js';
import { type FootnoteArea, footnoteAreaHeight } from './footnote-area.js';
import { forcedLinesKey } from './forced-lines.js';
import {
  type IncrementalResult,
  layoutSectionIncrementally,
  type SectionLayout,
} from './incremental-layout.js';
import { insertedTexts } from './inserted-texts.js';
import { footnoteArea, roomsFor, type SectionRegions, sectionRegions } from './page-regions.js';
import { cited, sectionPlaces } from './section-places.js';
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
  /** Receives each page laid out: the height its blocks take and the height it has for them. */
  onPage?: ((page: PageMetric) => void) | undefined;
  /**
   * Receives each section laid out, with how many of its blocks the engine laid out rather than
   * kept, and how many of its pages were laid out rather than reused.
   */
  onSection?: ((section: SectionReport) => void) | undefined;
  /** Where each section's layout is kept, so the next layout reuses the pages a change leaves. */
  memory?: LayoutMemory | undefined;
  /** Lays every block out, with no DOM (DOCE-PAGINATION-11.1). */
  engine: PagesTextEngine;
  /**
   * Receives why a layout stopped before its page numbers settled: its lists of contents' digits,
   * or the page count its headers and footers show, after their last pass.
   */
  onUnsettled?: ((reason: string) => void) | undefined;
}

/** What a layout did in one section. */
export interface SectionReport {
  readonly blocksMeasured: number;
  readonly pagesLaidOut: number;
  readonly pages: number;
  /** The height the engine gave each top-level block of its page content, whole, in order. */
  readonly heights: readonly number[];
}

/** The sections' layouts a document was laid out with, for the next layout to reuse. */
export interface LayoutMemory {
  sections: SectionLayout[];
  /** The page counts the last layout's regions took room for. */
  pages?: readonly number[] | undefined;
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

interface SectionFill {
  readonly blocks: readonly LayoutBlock[];
  readonly area: FootnoteArea | null;
  /** The section's page height inside its margins, before its regions take their room. */
  readonly pageHeight: number;
  /** The room the header and the footer take on each page. */
  readonly regions: SectionRegions;
  readonly rules: LayoutRules | undefined;
}

// Where a pass lays a section out: the number of its first page through the document, the
// document's page count it assumes, and the footnotes whose entries an earlier page holds.
interface SectionStart {
  readonly page: number;
  /** The page counts the regions take room for: each page the most any of them needs. */
  readonly pages: readonly number[];
  readonly shown: Set<string>;
}

// A number for each set of layout rules, so a section laid out under other rules is laid out again.
const ruleIds = new WeakMap<LayoutRules, number>();
let rulesSeen = 0;
function rulesId(rules: LayoutRules | undefined): number {
  if (!rules) return 0;
  if (!ruleIds.has(rules)) ruleIds.set(rules, (rulesSeen += 1));
  return ruleIds.get(rules) ?? 0;
}

// What a section's page heights depend on besides its blocks, as a key: its page height, its
// layout rules, its footnotes and, where its regions show them, its first page's number and the
// page count.
function fillKey(
  fill: SectionFill,
  start: Pick<SectionStart, 'page' | 'pages'>,
  perPage: boolean,
): string {
  const last = fill.area?.last;
  const entries = fill.area
    ? [...fill.area.entries].map(([id, height]) => `${id}:${height}:${last?.get(id) ?? ''}`)
    : [];
  const { reads } = fill.regions;
  const numbers = `${reads.current ? start.page : '-'}/${reads.total ? start.pages.join(',') : '-'}`;
  const head = [fill.pageHeight, rulesId(fill.rules), numbers, perPage, fill.area?.overhead ?? '-'];
  return [...head, ...entries].join('|');
}

function layoutSection(
  fill: SectionFill,
  start: SectionStart & { readonly previous: SectionLayout | undefined },
  options: DocumentLayoutOptions,
): { result: IncrementalResult; metrics: PageMetric[] } {
  const perPage = options.footnoteNumbering === 'page';
  const { area, regions } = fill;
  const { shown } = start;
  const rooms: ReturnType<typeof roomsFor>[] = [];
  const roomOn = (index: number) => {
    const room = rooms[index] ?? roomsFor(regions, start.page + index, start.pages);
    rooms[index] = room;
    return room;
  };
  const baseHeight = (index: number) => {
    const room = roomOn(index);
    return fill.pageHeight - room.header - room.footer;
  };
  const pageHeight = (blocks: readonly LayoutBlock[], index: number) => {
    if (!area) return baseHeight(index);
    const fresh = [...cited(blocks)].filter((id) => perPage || !shown.has(id));
    return baseHeight(index) - footnoteAreaHeight(area, fresh);
  };
  const metrics: PageMetric[] = [];
  const result = layoutSectionIncrementally({
    blocks: fill.blocks,
    key: fillKey(fill, start, perPage),
    previous: start.previous,
    // With footnotes numbered through the document, a page's room depends on those shown before.
    state: () => (area && !perPage ? [...shown].join(' ') : ''),
    geometry: (index) => {
      const { header, footer } = roomOn(index);
      return `${header}/${footer}`;
    },
    next: (queue, index) => layoutNextPage(queue, index, { pageHeight, rules: fill.rules }),
    page(page) {
      const index = metrics.length;
      const available = pageHeight(page, index);
      metrics.push({
        used: stackedHeight(page),
        stacked: stackedWithMargins(page),
        available,
        blocks: page.map((block) => block.height),
        tops: blockTops(page),
        ...roomOn(index),
        footnotes: baseHeight(index) - available,
      });
      for (const id of cited(page)) shown.add(id);
    },
  });
  return { result, metrics };
}

// The blocks, footnote area, page height and regions of each section of the state.
function sectionFills(state: EditorState, options: DocumentLayoutOptions) {
  const { engine } = options;
  const laidSoFar = () => engine.stats().laid;
  // The words other plugins draw in its text blocks, such as a comparison's deleted words.
  const inserted = insertedTexts(state, [forcedLinesKey]);
  return sectionPlaces(state.doc).map((place, index) => {
    const { section, content, footnotes } = place;
    const height = options.pageHeight;
    const pageHeight = typeof height === 'function' ? height(section, index) : height;
    const scope = (section.attrs.sectionName as string | null | undefined) ?? null;
    const at = { scope, engine };
    const regions = sectionRegions(state, at, place);
    const before = laidSoFar();
    const rules =
      typeof options.rules === 'function' ? options.rules(section, index) : options.rules;
    const contentNode = state.doc.nodeAt(content);
    const blocks = contentNode ? engine.measureContent(contentNode, scope, inserted) : [];
    const blocksMeasured = laidSoFar() - before;
    const area = footnoteArea(state, footnotes, at);
    const fill: SectionFill = { blocks, area, pageHeight, regions, rules };
    return { fill, blocksMeasured };
  });
}

// Passes at most this many times over a document whose regions show the page count: with the count
// the pass before came to, and from the second on, if that is not the count it comes to, leaving
// room for every count tried, so a count that flips between two values never leaves a region more
// text than its room.
const COUNT_PASSES = 3;

type SectionFills = ReturnType<typeof sectionFills>;

// One pass over the document's sections, assuming a page count: each section's layout and the
// number of its first page.
function layoutPass(
  fills: SectionFills,
  at: {
    readonly pages: readonly number[];
    readonly previous: readonly (SectionLayout | undefined)[];
  },
  options: DocumentLayoutOptions,
) {
  const shown = new Set<string>();
  let page = 1;
  const starts: number[] = [];
  const laid = fills.map(({ fill }, index) => {
    starts.push(page);
    const start = { page, pages: at.pages, shown, previous: at.previous[index] };
    const section = layoutSection(fill, start, options);
    page += section.result.pages.length;
    return section;
  });
  return { laid, starts, counted: page - 1 };
}

// Whether every page a pass laid out, assuming page counts, gives its regions the same room under
// the count it came to, so the pass holds for that count alone too.
function holds(
  fills: SectionFills,
  pass: ReturnType<typeof layoutPass>,
  assumed: readonly number[],
) {
  return fills.every(({ fill }, index) => {
    if (!fill.regions.reads.total) return true;
    const first = pass.starts[index] ?? 1;
    const count = pass.laid[index]?.result.pages.length ?? 0;
    for (let page = first; page < first + count; page += 1) {
      const before = roomsFor(fill.regions, page, assumed);
      const after = fill.regions.on(page, pass.counted);
      if (before.header !== after.header || before.footer !== after.footer) return false;
    }
    return true;
  });
}

// The document laid out until the page counts its regions took room for hold the count it came to,
// with the pages each section laid out over all passes. The count is drawn as the pages come to it.
function settlePasses(fills: SectionFills, options: DocumentLayoutOptions) {
  const readsTotal = fills.some(({ fill }) => fill.regions.reads.total);
  let previous: readonly (SectionLayout | undefined)[] = options.memory?.sections ?? [];
  let pages: readonly number[] = options.memory?.pages ?? [0];
  // The counts layouts came to; a first layout's guess of none is not one.
  const tried = new Set(options.memory?.pages ?? []);
  const laidOut = fills.map(() => 0);
  let pass = layoutPass(fills, { pages, previous }, options);
  let settled = false;
  for (let count = 1; ; count += 1) {
    pass.laid.forEach(({ result }, index) => {
      laidOut[index] = (laidOut[index] ?? 0) + result.pagesLaidOut;
    });
    if (!readsTotal || pages.includes(pass.counted)) settled = true;
    else if (holds(fills, pass, pages)) [settled, pages] = [true, [pass.counted]];
    if (settled || count >= COUNT_PASSES) break;
    tried.add(pass.counted);
    pages = count === 1 ? [pass.counted] : [...tried].sort((a, b) => a - b);
    previous = pass.laid.map(({ result }) => result.layout);
    pass = layoutPass(fills, { pages, previous }, options);
  }
  // Each section's layout, kept for the page counts it holds for.
  const perPage = options.footnoteNumbering === 'page';
  const layouts = pass.laid.map(({ result }, index) => {
    const fill = settled ? fills[index]?.fill : undefined;
    const start = { page: pass.starts[index] ?? 1, pages };
    return fill ? { ...result.layout, key: fillKey(fill, start, perPage) } : result.layout;
  });
  return { pass, laidOut, layouts, pages, settled };
}

// Passes at most this many times over a document with a list of contents or a page variable in its
// text, each time with room for one more digit in their page numbers, as long as the pages it comes
// to need more.
const DIGIT_PASSES = 3;

// The document laid out with its lists of contents' page boxes and its text's page variables'
// boxes keeping room for the digits of the page count it comes to (DOCE-PAGINATION-10.11, 11.13).
// Every layout starts from the least room, so the pages are the same whatever was laid out before,
// and the room only grows.
function settleDigits(state: EditorState, options: DocumentLayoutOptions) {
  const { engine } = options;
  let digits = engine.pageDigits(0);
  let fills = sectionFills(state, options);
  let settled = settlePasses(fills, options);
  const { doc } = state;
  if (!(hasContents(doc) || hasBodyPageVariable(doc))) return { fills, settled };
  for (let count = 1; ; count += 1) {
    const needed = engine.pageDigits(Math.max(settled.pass.counted, 10 ** (digits - 1)));
    if (needed === digits) break;
    if (count >= DIGIT_PASSES) {
      options.onUnsettled?.(
        `page numbers need ${String(needed)} digits after ${String(count)} passes`,
      );
      engine.pageDigits(10 ** (digits - 1));
      break;
    }
    digits = needed;
    fills = sectionFills(state, options);
    settled = settlePasses(fills, options);
  }
  return { fills, settled };
}

/**
 * The pages of each section of the whole document a state holds, as `projectDocument` takes them:
 * every block laid out by the engine, those it kept reused, and each page short by its header's,
 * its footer's and its footnote entries' heights, each laid out with the page's own number and the
 * page count.
 */
export function layoutDocument(state: EditorState, options: DocumentLayoutOptions): SectionPages[] {
  const { memory, engine } = options;
  engine.number(state.doc);
  const { fills, settled } = settleDigits(state, options);
  const { pass, laidOut, layouts, pages } = settled;
  if (!settled.settled) {
    options.onUnsettled?.(`the page count moved after ${String(COUNT_PASSES)} passes`);
  }
  pass.laid.forEach(({ result, metrics }, index) => {
    for (const metric of metrics) options.onPage?.(metric);
    const pagesLaidOut = laidOut[index] ?? 0;
    const blocksMeasured = fills[index]?.blocksMeasured ?? 0;
    const heights = fills[index]?.fill.blocks.map((block) => block.height) ?? [];
    options.onSection?.({ blocksMeasured, pagesLaidOut, pages: result.pages.length, heights });
  });
  if (memory) {
    memory.sections = layouts;
    memory.pages = pages;
  }
  return pass.laid.map(({ result }) => result.pages.map((page) => page.map((block) => block.node)));
}
