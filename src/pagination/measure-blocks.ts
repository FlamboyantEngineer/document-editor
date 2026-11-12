// Measures laid-out blocks in an editor view for the page layout: each block's height and margins,
// where a container's children or a list of contents' rows sit, and, lazily, the height and lines
// of a text block's text between two offsets. It only reads layout, so measuring a section forces
// one layout at most. A cache keeps each block's measurement while its node stays, moving it with
// the node's position. A block whose rendering depends on more than its node, such as a list of
// contents, says so with a measure key (`data-de-measure-key`), and a changed key measures it again.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';
import type {
  ChildLayout,
  LayoutBlock,
  LayoutRules,
  RowsMeasurement,
  TextMeasure,
  TextMeasurement,
} from '../model/index.js';

/** Measured blocks kept by node, so a block that has not changed is not measured again. */
export interface MeasureCache {
  /** Forgets every measurement, as when the width or the styles change. */
  clear(): void;
}

interface CacheEntry {
  block: LayoutBlock;
  readonly placement: Placement;
  readonly key: string | undefined;
  /** Whether its element was first or last among its siblings, which styles may zero margins at. */
  edges: string;
}

/** What a cache has served since it was made: blocks found, blocks absent, and blocks measured. */
export interface MeasureCounts {
  /** Blocks taken from the cache. */
  hits: number;
  /** Blocks the cache did not hold. */
  misses: number;
  /** Blocks measured in the view: those it did not hold, and those whose measure key changed. */
  measured: number;
}

interface CacheStore {
  entries: WeakMap<ProseMirrorNode, CacheEntry>;
  readonly counts: MeasureCounts;
}

const cacheEntries = new WeakMap<MeasureCache, CacheStore>();

/** A cache for measured blocks. */
export function createMeasureCache(): MeasureCache {
  const store: CacheStore = {
    entries: new WeakMap<ProseMirrorNode, CacheEntry>(),
    counts: { hits: 0, misses: 0, measured: 0 },
  };
  const cache: MeasureCache = {
    clear: () => {
      store.entries = new WeakMap();
    },
  };
  cacheEntries.set(cache, store);
  return cache;
}

/**
 * Forgets the measurement of the block of a page's content that holds a DOM node, such as an image
 * that loaded, so the next layout measures that block alone again. Returns whether one was held.
 */
export function forgetMeasurement(cache: MeasureCache, view: EditorView, target: Node): boolean {
  const store = cacheEntries.get(cache);
  if (!store || !view.dom.contains(target)) return false;
  let pos: number;
  try {
    pos = view.posAtDOM(target, 0);
  } catch {
    return false;
  }
  const $pos = view.state.doc.resolve(pos);
  const holders = [
    $pos.nodeAfter,
    ...Array.from({ length: $pos.depth + 1 }, (_, d) => $pos.node(d)),
  ];
  let forgot = false;
  for (const node of holders) if (node && store.entries.delete(node)) forgot = true;
  return forgot;
}

/** What a cache has served so far; clearing it keeps the counts. */
export function measureCacheCounts(cache: MeasureCache): Readonly<MeasureCounts> {
  return { ...(cacheEntries.get(cache)?.counts ?? { hits: 0, misses: 0, measured: 0 }) };
}

/** The attribute a block's element names what else its rendering depends on with. */
const MEASURE_KEY = 'deMeasureKey';

// Whether an element is first or last among its siblings, where styles may zero its margins.
function edgesOf(element: HTMLElement): string {
  const first = element.previousElementSibling ? '' : 'first';
  const last = element.nextElementSibling ? '' : 'last';
  return `${first}|${last}`;
}

function margins(element: HTMLElement) {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  return { marginTop: px(style?.marginTop ?? ''), marginBottom: px(style?.marginBottom ?? '') };
}

// The measurement a cache keeps for a node rendered as it was, moved to the node's position now.
// A block that became or stopped being the first or last of its siblings reads its margins again,
// since styles zero the margins at a page's edges.
function cachedBlock(
  cache: MeasureCache | undefined,
  node: ProseMirrorNode,
  at: { readonly pos: number; readonly element: HTMLElement },
) {
  const store = cache ? cacheEntries.get(cache) : undefined;
  if (!store) return undefined;
  const entry = store.entries.get(node);
  if (!entry) store.counts.misses += 1;
  if (!entry || entry.key !== at.element.dataset[MEASURE_KEY]) return undefined;
  store.counts.hits += 1;
  entry.placement.pos = at.pos;
  const edges = edgesOf(at.element);
  if (edges !== entry.edges) {
    entry.edges = edges;
    entry.block = { ...entry.block, ...margins(at.element) };
  }
  return entry.block;
}

// An image still loading measures provisionally: its block is not kept, so the next layout, which
// its load asks for, measures it again.
function isProvisional(element: HTMLElement): boolean {
  return [...element.querySelectorAll('img')].some((image) => !image.complete);
}

/** How blocks are measured. */
export interface MeasureOptions {
  /** How much the view is scaled on screen, such as by a zoom; measurements are divided by it. */
  scale?: number | undefined;
  /** Where measurements are kept between passes. */
  cache?: MeasureCache | undefined;
  /** Layout rules whose `measure` measures their node type in place of the built-in measuring. */
  rules?: LayoutRules | undefined;
}

// Where a measured block is now; its lazy measurements read positions through it.
interface Placement {
  pos: number;
}

const CONTAINER_TYPES = new Set([
  'blockquote',
  'bullet_list',
  'ordered_list',
  'list_item',
  'table',
  'script_block',
  'layout_section',
  'layout_column',
]);
const TEXT_TYPES = new Set(['paragraph', 'code_block']);

interface Measuring {
  readonly view: EditorView;
  readonly scale: number;
  readonly placement: Placement;
  readonly rules: LayoutRules | undefined;
}

function elementOf(view: EditorView, pos: number): HTMLElement | null {
  const dom = view.nodeDOM(pos);
  return dom && dom.nodeType === 1 ? (dom as HTMLElement) : null;
}

function px(value: string): number {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : 0;
}

// The distinct lines a range's boxes sit on.
function countLines(rects: Iterable<DOMRect>): number {
  const tops = new Set<number>();
  for (const rect of rects) {
    if (rect.height > 0.5 && rect.width > 0.5) tops.add(Math.round(rect.top));
  }
  return tops.size;
}

function measureRange(range: Range, scale: number): TextMeasure {
  return {
    height: range.getBoundingClientRect().height / scale,
    lines: countLines(range.getClientRects()),
  };
}

// A text block's text, by content offset, through the view's positions. `relative` is where the
// text block sits from the measured block's start.
function textMeasurement(measuring: Measuring, relative: number): TextMeasurement {
  const { view, scale, placement } = measuring;
  return {
    offset: 0,
    measure: (from, to) => {
      const pos = placement.pos + relative;
      const start = view.domAtPos(pos + 1 + from);
      const end = view.domAtPos(pos + 1 + to);
      const range = view.dom.ownerDocument.createRange();
      range.setStart(start.node, start.offset);
      range.setEnd(end.node, end.offset);
      return measureRange(range, scale);
    },
  };
}

// The text node and offset a character of an element's text falls at.
function textPoint(element: Element, index: number): { node: Node; offset: number } {
  const walker = element.ownerDocument.createTreeWalker(element, 4);
  let remaining = index;
  let last: Node = element;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const length = node.nodeValue?.length ?? 0;
    if (remaining <= length) return { node, offset: remaining };
    remaining -= length;
    last = node;
  }
  return { node: last, offset: last.nodeValue?.length ?? 0 };
}

// Linked code's code, by character, through the element that renders it.
function codeMeasurement(measuring: Measuring, relative: number): TextMeasurement | null {
  const codeAt = () =>
    elementOf(measuring.view, measuring.placement.pos + relative)?.querySelector('code');
  const first = codeAt();
  if (!first) return null;
  return {
    offset: 0,
    measure: (from, to) => {
      const code = codeAt() ?? first;
      const start = textPoint(code, from);
      const end = textPoint(code, to);
      const range = code.ownerDocument.createRange();
      range.setStart(start.node, start.offset);
      range.setEnd(end.node, end.offset);
      return measureRange(range, measuring.scale);
    },
  };
}

function childLayouts(measuring: Measuring, node: ProseMirrorNode, relative: number) {
  const layouts: ChildLayout[] = [];
  let origin: number | null = null;
  let complete = true;
  node.forEach((child, offset) => {
    const childRelative = relative + 1 + offset;
    const element = elementOf(measuring.view, measuring.placement.pos + childRelative);
    if (!element) {
      complete = false;
      return;
    }
    const rect = element.getBoundingClientRect();
    origin ??= rect.top;
    layouts.push({
      top: (rect.top - origin) / measuring.scale,
      bottom: (rect.bottom - origin) / measuring.scale,
      measurement: measureContent(measuring, { node: child, relative: childRelative }),
    });
  });
  return complete ? layouts : null;
}

// A node inside a measured block, by where it sits from the block's start.
interface Placed {
  readonly node: ProseMirrorNode;
  readonly relative: number;
}

// Where a list of contents' entry rows sit from its top.
function rowsMeasurement(measuring: Measuring, relative: number): RowsMeasurement | undefined {
  const element = elementOf(measuring.view, measuring.placement.pos + relative);
  if (!element) return undefined;
  const top = element.getBoundingClientRect().top;
  const rows = [...element.querySelectorAll('.de-contents__entry')].map((row) => {
    const rect = row.getBoundingClientRect();
    return {
      top: (rect.top - top) / measuring.scale,
      bottom: (rect.bottom - top) / measuring.scale,
    };
  });
  return { rows };
}

// A rule's own measure for a host's node type; undefined when its rule has none.
function ruleMeasurement(measuring: Measuring, { node, relative }: Placed): unknown {
  const { rules } = measuring;
  const rule = rules && Object.hasOwn(rules, node.type.name) ? rules[node.type.name] : undefined;
  if (!rule?.measure) return undefined;
  const element = elementOf(measuring.view, measuring.placement.pos + relative);
  return element ? rule.measure({ node, element, scale: measuring.scale }) : undefined;
}

// The height a container takes beyond its children's span: above its first child, and its own
// padding and border below. A grid that stretches it to a taller neighbour's height changes neither.
function overheadOf(measuring: Measuring, relative: number): number {
  const { view, placement, scale } = measuring;
  const element = elementOf(view, placement.pos + relative);
  const first = elementOf(view, placement.pos + relative + 1);
  const style = element?.ownerDocument.defaultView?.getComputedStyle(element);
  if (!element || !first || !style) return 0;
  const above = (first.getBoundingClientRect().top - element.getBoundingClientRect().top) / scale;
  return Math.max(0, above) + px(style.paddingBottom) + px(style.borderBottomWidth);
}

function measureContent(measuring: Measuring, placed: Placed): unknown {
  const { node, relative } = placed;
  const name = node.type.name;
  const own = ruleMeasurement(measuring, placed);
  if (own !== undefined) return own;
  if (name === 'toc_block') return rowsMeasurement(measuring, relative);
  if (TEXT_TYPES.has(name)) return textMeasurement(measuring, relative);
  if (name === 'linked_code_block') return codeMeasurement(measuring, relative);
  if (!CONTAINER_TYPES.has(name)) return undefined;
  const children = childLayouts(measuring, node, relative);
  if (!children) return undefined;
  return name === 'table' ? { children } : { children, overhead: overheadOf(measuring, relative) };
}

/** One block the view laid out at a position, measured; null when it has no element. */
export function measureBlock(
  view: EditorView,
  pos: number,
  options: MeasureOptions = {},
): LayoutBlock | null {
  const node = view.state.doc.nodeAt(pos);
  if (!node) return null;
  const element = elementOf(view, pos);
  if (!element) return null;
  const cached = cachedBlock(options.cache, node, { pos, element });
  if (cached) return cached;
  const scale = options.scale && options.scale > 0 ? options.scale : 1;
  const measuring = { view, scale, placement: { pos }, rules: options.rules };
  const block: LayoutBlock = {
    node,
    height: element.getBoundingClientRect().height / scale,
    ...margins(element),
    measurement: measureContent(measuring, { node, relative: 0 }),
  };
  const store = options.cache ? cacheEntries.get(options.cache) : undefined;
  if (store) {
    store.counts.measured += 1;
    if (isProvisional(element)) return block;
    const key = element.dataset[MEASURE_KEY];
    const edges = edgesOf(element);
    store.entries.set(node, { block, placement: measuring.placement, key, edges });
  }
  return block;
}

/** The blocks a node at a position holds, measured in order, such as a page's content. */
export function measureChildBlocks(
  view: EditorView,
  pos: number,
  options: MeasureOptions = {},
): LayoutBlock[] {
  const parent = view.state.doc.nodeAt(pos);
  const blocks: LayoutBlock[] = [];
  parent?.forEach((_child, offset) => {
    const block = measureBlock(view, pos + 1 + offset, options);
    if (block) blocks.push(block);
  });
  return blocks;
}
