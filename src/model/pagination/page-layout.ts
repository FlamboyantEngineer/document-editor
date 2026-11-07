// Lays a section's measured blocks out on pages. The editor measures each block; this module only
// decides which blocks go on which page, so it reads no DOM. A block that does not fit is split by
// its type's split, which the editor provides because splitting measures text.

import type { Node as ProseMirrorNode } from 'prosemirror-model';

/** A block with the measurements its page layout needs, in CSS pixels. */
export interface LayoutBlock {
  readonly node: ProseMirrorNode;
  /** Its height without margins. */
  readonly height: number;
  readonly marginTop: number;
  readonly marginBottom: number;
  /** The height of its first line, which a heading before it keeps on its page. */
  readonly leadLineHeight?: number | null | undefined;
  /** Whether it starts a new page, as the fragments after a split's first do. */
  readonly breakBefore?: boolean | undefined;
  /** What the editor measured it from, for its split to read. */
  readonly measurement?: unknown;
}

/** Where a block that does not fit is being split. */
export interface SplitContext {
  readonly pageIndex: number;
  /** The page's content height. */
  readonly pageHeight: number;
  /** The height left on the page below the blocks already on it. */
  readonly remainingHeight: number;
  readonly rules: LayoutRules;
  /** The host or editor value passed as `PageLayoutOptions.context`. */
  readonly context: unknown;
}

/** A split block: the fragment that fits, and the fragments that follow it. */
export interface SplitBlock {
  head: LayoutBlock;
  tail: LayoutBlock[];
}

/** How one node type is laid out. */
export interface LayoutRule {
  /** Whether a heading before the block stays on the block's page. */
  readonly keepsWithHeading?: boolean | undefined;
  /** Whether the page ends after the block, as a page break's does. */
  readonly endsPage?: boolean | undefined;
  /** The block split to fit a height, or null when it cannot split there. */
  readonly split?:
    ((block: LayoutBlock, height: number, context: SplitContext) => SplitBlock | null) | undefined;
}

/** Layout rules by node type name. */
export type LayoutRules = Readonly<Record<string, LayoutRule>>;

/** A page's content height, which may depend on the blocks that would be on it. */
export type PageHeight = number | ((blocks: readonly LayoutBlock[], pageIndex: number) => number);

/** What a page layout is built from beside the blocks. */
export interface PageLayoutOptions {
  pageHeight: PageHeight;
  rules?: LayoutRules | undefined;
  context?: unknown;
}

/** The space a block keeps free at the foot of a page, so rounding never overflows it. */
export const PAGE_SAFETY_MARGIN_PX = 2;

const KEEPS_WITH_HEADING: LayoutRule = { keepsWithHeading: true };

/** The layout rules of the document schema's block types, before the editor adds its splits. */
export const LAYOUT_RULES: LayoutRules = Object.freeze({
  paragraph: KEEPS_WITH_HEADING,
  heading: KEEPS_WITH_HEADING,
  blockquote: KEEPS_WITH_HEADING,
  bullet_list: KEEPS_WITH_HEADING,
  ordered_list: KEEPS_WITH_HEADING,
  figure: KEEPS_WITH_HEADING,
  math_display: KEEPS_WITH_HEADING,
  table: KEEPS_WITH_HEADING,
  code_block: KEEPS_WITH_HEADING,
  linked_code_block: KEEPS_WITH_HEADING,
  toc_block: {},
  page_break: { endsPage: true },
});

// Measurements are compared at a thousandth of a pixel, so sums of fractional heights stay stable.
function snap(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value * 1000) / 1000) : 0;
}

function ruleFor(rules: LayoutRules, node: ProseMirrorNode): LayoutRule {
  return (Object.hasOwn(rules, node.type.name) ? rules[node.type.name] : undefined) ?? {};
}

/** The height blocks take stacked, with each pair's margins collapsed and no outer margins. */
export function stackedHeight(blocks: readonly LayoutBlock[]): number {
  let height = 0;
  blocks.forEach((block, index) => {
    const previous = index > 0 ? blocks[index - 1] : undefined;
    const gap = previous ? Math.max(previous.marginBottom, block.marginTop, 0) : 0;
    height += gap + Math.max(0, block.height);
  });
  return snap(height);
}

function resolvePageHeight(pageHeight: PageHeight, blocks: readonly LayoutBlock[], index: number) {
  const height = typeof pageHeight === 'function' ? pageHeight(blocks, index) : pageHeight;
  return Number.isFinite(height) && height > 0 ? height : 1;
}

/** A heading's level for keeping headings together: a document title is 0. */
export function headingLevel(node: ProseMirrorNode | undefined): number | null {
  if (node?.type.name !== 'heading') return null;
  if (node.attrs.docTitle) return 0;
  const level = Number(node.attrs.level);
  return Number.isFinite(level) && level >= 1 ? level : 1;
}

// The blocks a heading keeps on its page: the deeper headings under it, and the block they head
// when that block keeps with a heading.
function headingGroup(blocks: readonly LayoutBlock[], rules: LayoutRules): LayoutBlock[] {
  const group: LayoutBlock[] = [];
  for (const block of blocks) {
    const level = headingLevel(block.node);
    const previous = group.at(-1);
    const previousLevel = previous ? headingLevel(previous.node) : null;
    if (previous && previousLevel === null) break;
    if (previous && level !== null && previousLevel !== null && level <= previousLevel) break;
    if (previous && level === null && !ruleFor(rules, block.node).keepsWithHeading) break;
    group.push(block);
    if (level === null) break;
  }
  return group;
}

// A splittable block a heading keeps with needs only its first line on the heading's page.
function headingGroupHeight(group: readonly LayoutBlock[], rules: LayoutRules): number {
  const last = group.at(-1);
  const lead = last?.leadLineHeight;
  if (!last || !ruleFor(rules, last.node).split || !lead || !Number.isFinite(lead) || lead <= 0) {
    return stackedHeight(group);
  }
  return stackedHeight([...group.slice(0, -1), { ...last, height: lead, marginBottom: 0 }]);
}

interface PageFill {
  readonly blocks: LayoutBlock[];
  readonly index: number;
  readonly options: PageLayoutOptions;
  readonly rules: LayoutRules;
}

function gapBefore(page: PageFill, block: LayoutBlock): number {
  const last = page.blocks.at(-1);
  return last ? Math.max(0, last.marginBottom, block.marginTop) : 0;
}

// The height left on the page below its blocks and the gap before the next one.
function remainingHeight(page: PageFill, candidates: readonly LayoutBlock[]) {
  const [next] = candidates;
  const pageHeight = resolvePageHeight(
    page.options.pageHeight,
    [...page.blocks, ...candidates],
    page.index,
  );
  const used = page.blocks.length ? stackedHeight(page.blocks) : 0;
  const gap = next ? gapBefore(page, next) : 0;
  return { pageHeight, remaining: Math.max(0, pageHeight - used - gap) };
}

function fittingHeight(remaining: number): number {
  return Math.max(0, remaining - PAGE_SAFETY_MARGIN_PX);
}

// Whether a heading, and what it keeps with, would leave the page for the next one.
function headingMovesOn(page: PageFill, queue: readonly LayoutBlock[]): boolean {
  if (!page.blocks.length || headingLevel(queue[0]?.node) === null) return false;
  const group = headingGroup(queue, page.rules);
  const { remaining } = remainingHeight(page, group);
  return headingGroupHeight(group, page.rules) > fittingHeight(remaining);
}

function pageEndsBefore(page: PageFill, queue: readonly LayoutBlock[]): boolean {
  const [block] = queue;
  if (!block || !page.blocks.length) return false;
  return Boolean(block.breakBefore) || headingMovesOn(page, queue);
}

// Places the next block, whole or split; false when the page is full.
function placeNext(page: PageFill, queue: LayoutBlock[]): boolean {
  const [block] = queue;
  if (!block) return false;
  const rule = ruleFor(page.rules, block.node);
  const { pageHeight, remaining } = remainingHeight(page, [block]);
  const fitting = fittingHeight(remaining);
  if (rule.endsPage || block.height <= fitting || (!page.blocks.length && !rule.split)) {
    page.blocks.push(block);
    queue.shift();
    return !rule.endsPage;
  }
  const context = { pageIndex: page.index, pageHeight, remainingHeight: remaining };
  const parts = rule.split?.(block, fitting, {
    ...context,
    rules: page.rules,
    context: page.options.context,
  });
  if (parts) {
    page.blocks.push(parts.head);
    queue.splice(0, 1, ...parts.tail);
    return true;
  }
  if (page.blocks.length) return false;
  page.blocks.push(block);
  queue.shift();
  return true;
}

/**
 * Fills one page from the front of a queue of blocks, removing what it places; a split leaves its
 * remaining fragments at the front. A page always takes at least one block.
 */
export function layoutNextPage(
  queue: LayoutBlock[],
  pageIndex: number,
  options: PageLayoutOptions,
): LayoutBlock[] {
  const page: PageFill = {
    blocks: [],
    index: pageIndex,
    options,
    rules: options.rules ?? LAYOUT_RULES,
  };
  while (queue.length && !pageEndsBefore(page, queue)) {
    if (!placeNext(page, queue)) break;
  }
  return page.blocks;
}

/** A section's blocks laid out on pages in order. */
export function layoutPages(
  blocks: readonly LayoutBlock[],
  options: PageLayoutOptions,
): LayoutBlock[][] {
  const queue = [...blocks];
  const pages: LayoutBlock[][] = [];
  while (queue.length) pages.push(layoutNextPage(queue, pages.length, options));
  return pages;
}
