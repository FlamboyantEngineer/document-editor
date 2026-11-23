// The measurements of laid-out blocks kept by node, so a block that has not changed is not measured
// again: each block's measurement moves with its node's position, and is forgotten alone when the
// element it was measured from changes size after it was measured, such as an image that loaded, a
// host's node view that filled in or a late style. A block whose rendering depends on more than its
// node, such as a list of contents, says so with a measure key (`data-de-measure-key`), and a
// changed key measures it again.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';
import type { LayoutBlock } from '../model/index.js';

/** Measured blocks kept by node, so a block that has not changed is not measured again. */
export interface MeasureCache {
  /** Forgets every measurement, as when the width or the styles change. */
  clear(): void;
}

/** Where a measured block is now; its lazy measurements read positions through it. */
export interface Placement {
  pos: number;
}

interface CacheEntry {
  block: LayoutBlock;
  readonly placement: Placement;
  readonly key: string | undefined;
  /** Whether its element was first or last among its siblings, which styles may zero margins at. */
  edges: string;
  /** The element it was measured from, and how much the view was scaled then. */
  readonly element: HTMLElement;
  readonly scale: number;
  /**
   * Whether an image in it was still loading: such a block is never served, and is kept only to
   * tell whether the image's load changed its height.
   */
  readonly provisional: boolean;
}

/** What a cache has served since it was made: blocks found, blocks absent, and blocks measured. */
interface MeasureCounts {
  /** Blocks taken from the cache. */
  hits: number;
  /** Blocks the cache did not hold. */
  misses: number;
  /** Blocks measured in the view: those it did not hold, and those whose measure key changed. */
  measured: number;
  /** Blocks forgotten because their element changed size after they were measured. */
  drifted: number;
}

interface CacheStore {
  entries: WeakMap<ProseMirrorNode, CacheEntry>;
  readonly counts: MeasureCounts;
  /** What follows each element measured, so its changes of size are noticed. */
  watch: ((element: HTMLElement) => void) | null;
}

const cacheEntries = new WeakMap<MeasureCache, CacheStore>();

// A block's height changed when it moved more than this many CSS pixels.
const MOVED = 0.01;

/** A cache for measured blocks. */
export function createMeasureCache(): MeasureCache {
  const store: CacheStore = {
    entries: new WeakMap<ProseMirrorNode, CacheEntry>(),
    counts: { hits: 0, misses: 0, measured: 0, drifted: 0 },
    watch: null,
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
 * Follows each element a cache measures a block from, such as with a resize observer, until
 * `stop`; the elements are given as their blocks are measured.
 */
export function watchMeasured(cache: MeasureCache, watch: (element: HTMLElement) => void) {
  const store = cacheEntries.get(cache);
  if (store) store.watch = watch;
  return () => {
    if (store?.watch === watch) store.watch = null;
  };
}

/** What a cache has served so far; clearing it keeps the counts. */
export function measureCacheCounts(cache: MeasureCache): Readonly<MeasureCounts> {
  const counts = cacheEntries.get(cache)?.counts;
  return { ...(counts ?? { hits: 0, misses: 0, measured: 0, drifted: 0 }) };
}

/**
 * What a change of size in a view's DOM does to the measurements: `moved` when it forgot a block
 * whose height changed, or `unmeasured` when no block holding it is kept, so the next layout
 * measures it; `kept` when the blocks holding it kept their height; `outside` when it is in no
 * block of the view.
 */
type Remeasured = 'moved' | 'unmeasured' | 'kept' | 'outside';

// The nodes holding a DOM node of the view, innermost first; null when it is in none.
function holdersOf(view: EditorView, target: Node): (ProseMirrorNode | null | undefined)[] | null {
  if (!view.dom.contains(target) || target === view.dom) return null;
  let pos: number;
  try {
    pos = view.posAtDOM(target, 0);
  } catch {
    return null;
  }
  const $pos = view.state.doc.resolve(pos);
  return [
    $pos.nodeAfter,
    ...Array.from({ length: $pos.depth + 1 }, (_, d) => $pos.node($pos.depth - d)),
  ];
}

function heightNow(entry: CacheEntry): number {
  return entry.element.getBoundingClientRect().height / entry.scale;
}

/**
 * Forgets the measurement of the block holding a DOM node that changed size, such as an image that
 * loaded, when the block's height moved, so the next layout measures that block alone again.
 */
export function forgetMeasurement(cache: MeasureCache, view: EditorView, target: Node): Remeasured {
  const store = cacheEntries.get(cache);
  const holders = store ? holdersOf(view, target) : null;
  if (!store || !holders) return 'outside';
  let result: Remeasured = 'unmeasured';
  for (const node of holders) {
    const entry = node ? store.entries.get(node) : undefined;
    if (!node || !entry) continue;
    const drawn = view.dom.contains(entry.element);
    if (drawn && Math.abs(heightNow(entry) - entry.block.height) <= MOVED) {
      if (result === 'unmeasured') result = 'kept';
      continue;
    }
    store.entries.delete(node);
    result = 'moved';
  }
  return result;
}

/**
 * Forgets the block measured from an element that changed size after it was measured, as a resize
 * observer tells, when its height moved. A block that is not kept, or no longer drawn by that
 * element, waits for the layout its own change asks for. Returns whether it forgot one.
 */
export function forgetDrifted(
  cache: MeasureCache,
  view: EditorView,
  element: HTMLElement,
): boolean {
  const store = cacheEntries.get(cache);
  if (!store || forgetMeasurement(cache, view, element) !== 'moved') return false;
  store.counts.drifted += 1;
  return true;
}

/** The attribute a block's element names what else its rendering depends on with. */
const MEASURE_KEY = 'deMeasureKey';

/** A CSS length in pixels, or 0. */
export function px(value: string): number {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : 0;
}

// Whether an element is first or last among its siblings, where styles may zero its margins.
function edgesOf(element: HTMLElement): string {
  const first = element.previousElementSibling ? '' : 'first';
  const last = element.nextElementSibling ? '' : 'last';
  return `${first}|${last}`;
}

/**
 * A computed style's margin at the start or end of the block axis: its top or bottom margin in a
 * horizontal writing mode, its logical one in a vertical one.
 */
export function blockMargin(style: CSSStyleDeclaration | undefined, side: 'start' | 'end'): string {
  if (/^(vertical|sideways)/.test(style?.writingMode ?? '')) {
    return style?.getPropertyValue(`margin-block-${side}`) ?? '';
  }
  return (side === 'start' ? style?.marginTop : style?.marginBottom) ?? '';
}

// Whether a side of a block lets its first or last child's margin through it, as a plain block
// with no border or padding there does in a horizontal writing mode. A block that starts its own
// formatting context (a display other than block, clipped overflow, layout or paint containment)
// keeps its children's margins.
function passesMargin(style: CSSStyleDeclaration, side: 'top' | 'bottom'): boolean {
  if (style.display !== 'block' || !['', 'visible'].includes(style.overflow)) return false;
  if (/\b(layout|paint|strict|content)\b/.test(style.contain)) return false;
  if (/^(vertical|sideways)/.test(style.writingMode)) return false;
  const padding = side === 'top' ? style.paddingTop : style.paddingBottom;
  const border = side === 'top' ? style.borderTopWidth : style.borderBottomWidth;
  return px(padding) === 0 && px(border) === 0;
}

// Whether a child sits in its parent's flow as a block, so its margins can meet the parent's edge.
function inFlowBlock(style: CSSStyleDeclaration | undefined): boolean {
  if (!style || style.display === 'none' || style.display.startsWith('inline')) return false;
  return !['absolute', 'fixed'].includes(style.position) && ['', 'none'].includes(style.float);
}

// A block's first or last child in its flow, whose margin may meet that side of the block.
function edgeChild(element: Element, side: 'top' | 'bottom'): HTMLElement | null {
  const view = element.ownerDocument.defaultView;
  const children = [...element.children];
  if (side === 'bottom') children.reverse();
  const child = children.find((each) => inFlowBlock(view?.getComputedStyle(each)));
  return (child as HTMLElement | undefined) ?? null;
}

// A child's margin that passes through the side of the block holding it, or none.
function passedMargin(style: CSSStyleDeclaration, element: Element, side: 'top' | 'bottom') {
  const child = passesMargin(style, side) ? edgeChild(element, side) : null;
  if (!child) return 0;
  const { marginTop, marginBottom } = margins(child);
  return side === 'top' ? marginTop : marginBottom;
}

/**
 * An element's margins at the start and end of its block axis, in any writing mode, with the
 * margins of its first and last children that pass through a side with no padding or border, as
 * a script's output, a template block's markup or a table's caption pass theirs.
 */
export function margins(element: HTMLElement): { marginTop: number; marginBottom: number } {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  const own = {
    marginTop: px(blockMargin(style, 'start')),
    marginBottom: px(blockMargin(style, 'end')),
  };
  if (!style) return own;
  return {
    marginTop: Math.max(own.marginTop, passedMargin(style, element, 'top')),
    marginBottom: Math.max(own.marginBottom, passedMargin(style, element, 'bottom')),
  };
}

/** A block drawn as an element at a position. */
export interface DrawnBlock {
  readonly node: ProseMirrorNode;
  readonly pos: number;
  readonly element: HTMLElement;
}

/**
 * The measurement a cache keeps for a node rendered as it was, moved to the node's position now.
 * A block that became or stopped being the first or last of its siblings reads its margins again,
 * since styles zero the margins at a page's edges.
 */
export function cachedBlock(cache: MeasureCache | undefined, at: DrawnBlock) {
  const store = cache ? cacheEntries.get(cache) : undefined;
  if (!store) return undefined;
  const entry = store.entries.get(at.node);
  if (!entry || entry.provisional) store.counts.misses += 1;
  if (!entry || entry.provisional || entry.key !== at.element.dataset[MEASURE_KEY]) {
    return undefined;
  }
  store.counts.hits += 1;
  entry.placement.pos = at.pos;
  const edges = edgesOf(at.element);
  if (edges !== entry.edges) {
    entry.edges = edges;
    entry.block = { ...entry.block, ...margins(at.element) };
  }
  return entry.block;
}

/** How a block was just measured: its measurement, where it is, and whether it is provisional. */
export interface Measured {
  readonly block: LayoutBlock;
  readonly placement: Placement;
  readonly scale: number;
  readonly provisional: boolean;
}

/** Keeps a block just measured from its element, and follows the element's size. */
export function keepBlock(cache: MeasureCache | undefined, at: DrawnBlock, measured: Measured) {
  const store = cache ? cacheEntries.get(cache) : undefined;
  if (!store) return;
  store.counts.measured += 1;
  const { element } = at;
  store.entries.set(at.node, {
    ...measured,
    element,
    key: element.dataset[MEASURE_KEY],
    edges: edgesOf(element),
  });
  store.watch?.(element);
}
