// Lays a section's measured blocks out on pages. The editor measures each block; this module only
// decides which blocks go on which page, so it reads no DOM. A block that does not fit is split by
// its type's split, which the editor provides because splitting measures text.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { splitContainer, splitList, splitListItem } from './container-split.js';
import { splitContents } from './contents-split.js';
import { splitHeldWith } from './held-split.js';
import { imageBox } from './image-box.js';
import { splitLayoutSection } from './layout-section-split.js';
import { signatureSize } from './signature-size.js';
import { splitTableFigureWith, splitTableWith } from './table-split.js';
import { splitCode, splitParagraph } from './text-split.js';

/** A block with the measurements its page layout needs, in CSS pixels. */
export interface LayoutBlock {
  readonly node: ProseMirrorNode;
  /** Its height without margins. */
  readonly height: number;
  readonly marginTop: number;
  readonly marginBottom: number;
  /** Whether it starts a new page, as the fragments after a split's first do. */
  readonly breakBefore?: boolean | undefined;
  /** What the layout engine laid it out as, for its split to read. */
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

/** Text a size rule measures, in the template's paragraph or code block typography. */
export interface SizeTextOptions {
  /** The template style the text is set in; `paragraph` by default. */
  readonly block?: 'paragraph' | 'code_block' | undefined;
}

/**
 * Text measured as the pages lay it out: the layout engine's own line breaking, in the fonts the
 * host serves, never the browser's (DOCE-PAGINATION-14.1).
 */
export interface SizeText {
  /** One line's width. */
  width(text: string, options?: SizeTextOptions): number;
  /** The text wrapped at a width: how many lines it takes and how tall they are. */
  lines(
    text: string,
    options: SizeTextOptions & { readonly width: number },
  ): { readonly count: number; readonly height: number };
}

/** What a rule sizes a node from: the node alone, the room it is given and the served fonts. */
export interface SizeInput {
  readonly node: ProseMirrorNode;
  /** The width a block is given, or the width of the line an inline node sits on. */
  readonly width: number;
  /** The template section it is in; null for the template's own. */
  readonly scope: string | null;
  readonly text: SizeText;
  /** The language the pages are laid out in (a BCP 47 tag); empty for none. */
  readonly language: string;
  /** How the pages show suggestions: all of them, or the document as it would be or was. */
  readonly markup: 'all' | 'final' | 'original';
}

/** A node's box from its rule: a height, and an inline node's width and baseline. */
export interface RuleSize {
  readonly height: number;
  /** An inline node's width; a block takes its whole width. */
  readonly width?: number | undefined;
  /** An inline node's baseline from its top; its bottom by default. */
  readonly baseline?: number | undefined;
}

/** How one node type is laid out. */
export interface LayoutRule {
  /**
   * A host node's box, worked out from the node before it is drawn (DOCE-PAGINATION-14.1): pure and
   * synchronous, so the pages are laid out once and alike everywhere. The node's view is drawn in
   * that box, clipped. A sized block is moved whole, never split.
   */
  readonly size?: ((input: SizeInput) => RuleSize) | undefined;
  /** Changes when `size` would give other sizes for the same nodes, so none is kept stale. */
  readonly sizeKey?: string | number | undefined;
  /**
   * Whether a heading before the block stays on the block's page. The heading stays when the block
   * fits after it whole, or its split places a first fragment there: the block's lead.
   */
  readonly keepsWithHeading?: boolean | undefined;
  /** Whether the page ends after the block, as a page break's does. */
  readonly endsPage?: boolean | undefined;
  /** The block split to fit a height, or null when it cannot split there; never with `size`. */
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
const CODE: LayoutRule = { keepsWithHeading: true, split: splitCode };
const LIST: LayoutRule = { keepsWithHeading: true, split: splitList };
const CONTAINER: LayoutRule = { keepsWithHeading: true, split: splitContainer };

/** What the layout rules follow from a document's template. */
export interface LayoutRuleOptions {
  /** Whether a split table's later parts repeat its header rows; by default they do. */
  repeatTableHeader?: boolean | undefined;
}

/**
 * The layout rules of the document schema's block types. A block splits when the editor measured
 * it: a text block's text (`TextMeasurement`), or where a container's children sit
 * (`ContainerMeasurement`).
 */
export function createLayoutRules({
  repeatTableHeader = true,
}: LayoutRuleOptions = {}): LayoutRules {
  return Object.freeze({
    paragraph: { keepsWithHeading: true, split: splitParagraph },
    heading: KEEPS_WITH_HEADING,
    blockquote: CONTAINER,
    script_block: CONTAINER,
    layout_section: { keepsWithHeading: true, split: splitLayoutSection },
    bullet_list: LIST,
    ordered_list: LIST,
    list_item: { split: splitListItem },
    figure: KEEPS_WITH_HEADING,
    embed: CONTAINER,
    math_display: KEEPS_WITH_HEADING,
    table: { keepsWithHeading: true, split: splitTableWith(repeatTableHeader) },
    table_figure: { keepsWithHeading: true, split: splitTableFigureWith(repeatTableHeader) },
    code_block: CODE,
    code_figure: { keepsWithHeading: true, split: splitHeldWith(splitCode) },
    linked_code_block: CODE,
    toc_block: { split: splitContents },
    page_break: { endsPage: true },
    signature: { size: signatureSize },
    image: { size: imageBox },
  });
}

/** The layout rules with the default options. */
export const LAYOUT_RULES: LayoutRules = createLayoutRules();

// Measurements are compared at a thousandth of a pixel, so sums of fractional heights stay stable.
function snap(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value * 1000) / 1000) : 0;
}

function ruleFor(rules: LayoutRules, node: ProseMirrorNode): LayoutRule {
  const rule = (Object.hasOwn(rules, node.type.name) ? rules[node.type.name] : undefined) ?? {};
  // A block its rule sizes is a box moved whole, never split (DOCE-PAGINATION-14.1).
  return rule.size ? { ...rule, split: undefined } : rule;
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

function splitContext(page: PageFill, pageHeight: number, remaining: number): SplitContext {
  return {
    pageIndex: page.index,
    pageHeight,
    remainingHeight: remaining,
    rules: page.rules,
    context: page.options.context,
  };
}

// Whether the block a heading keeps with leaves no lead below the headings: it neither fits whole
// nor splits with a first fragment there, so the split's own limits, such as a paragraph's two
// lines on each side or a table's header and first row, decide.
function leadMissing(page: PageFill, headings: readonly LayoutBlock[], block: LayoutBlock) {
  const placed = { ...page, blocks: [...page.blocks, ...headings] };
  const { pageHeight, remaining } = remainingHeight(placed, [block]);
  const fitting = fittingHeight(remaining);
  if (block.height <= fitting) return false;
  const split = ruleFor(page.rules, block.node).split;
  return fitting <= 0 || !split?.(block, fitting, splitContext(placed, pageHeight, remaining));
}

// Whether a heading, and what it keeps with, would leave the page for the next one.
function headingMovesOn(page: PageFill, queue: readonly LayoutBlock[]): boolean {
  if (!page.blocks.length || headingLevel(queue[0]?.node) === null) return false;
  const group = headingGroup(queue, page.rules);
  const { remaining } = remainingHeight(page, group);
  if (stackedHeight(group) <= fittingHeight(remaining)) return false;
  const last = group.at(-1);
  if (!last || headingLevel(last.node) !== null) return true;
  const headings = group.slice(0, -1);
  const { remaining: headingRoom } = remainingHeight(page, headings);
  return stackedHeight(headings) > fittingHeight(headingRoom) || leadMissing(page, headings, last);
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
  const parts = rule.split?.(block, fitting, splitContext(page, pageHeight, remaining));
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
