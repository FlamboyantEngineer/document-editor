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
  readonly block: LayoutBlock;
  readonly placement: Placement;
  readonly key: string | undefined;
}

const cacheEntries = new WeakMap<MeasureCache, { entries: WeakMap<ProseMirrorNode, CacheEntry> }>();

/** A cache for measured blocks. */
export function createMeasureCache(): MeasureCache {
  const store = { entries: new WeakMap<ProseMirrorNode, CacheEntry>() };
  const cache: MeasureCache = {
    clear: () => {
      store.entries = new WeakMap();
    },
  };
  cacheEntries.set(cache, store);
  return cache;
}

/** The attribute a block's element names what else its rendering depends on with. */
const MEASURE_KEY = 'deMeasureKey';

// The measurement a cache keeps for a node rendered as it was, moved to the node's position now.
function cachedBlock(
  cache: MeasureCache | undefined,
  node: ProseMirrorNode,
  at: { readonly pos: number; readonly element: HTMLElement },
) {
  const entry = cache ? cacheEntries.get(cache)?.entries.get(node) : undefined;
  if (!entry || entry.key !== at.element.dataset[MEASURE_KEY]) return undefined;
  entry.placement.pos = at.pos;
  return entry.block;
}

/** How blocks are measured. */
export interface MeasureOptions {
  /** How much the view is scaled on screen, such as by a zoom; measurements are divided by it. */
  scale?: number | undefined;
  /** Where measurements are kept between passes. */
  cache?: MeasureCache | undefined;
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
]);
const TEXT_TYPES = new Set(['paragraph', 'code_block']);

interface Measuring {
  readonly view: EditorView;
  readonly scale: number;
  readonly placement: Placement;
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

function measureContent(measuring: Measuring, { node, relative }: Placed): unknown {
  const name = node.type.name;
  if (name === 'toc_block') return rowsMeasurement(measuring, relative);
  if (TEXT_TYPES.has(name)) return textMeasurement(measuring, relative);
  if (name === 'linked_code_block') return codeMeasurement(measuring, relative);
  if (!CONTAINER_TYPES.has(name)) return undefined;
  const children = childLayouts(measuring, node, relative);
  return children ? { children } : undefined;
}

// How far a block's first line of text reaches below its top: a text block's own first line, or a
// container's first child's, which a heading before the block keeps on its page.
function leadLineHeight(measuring: Measuring, node: ProseMirrorNode, pos: number): number | null {
  const { view, scale } = measuring;
  const element = elementOf(view, pos);
  if (!element) return null;
  const top = element.getBoundingClientRect().top;
  if (CONTAINER_TYPES.has(node.type.name) && node.firstChild) {
    const childPos = pos + 1;
    const child = elementOf(view, childPos);
    const lead = child ? leadLineHeight(measuring, node.firstChild, childPos) : null;
    return child && lead !== null ? (child.getBoundingClientRect().top - top) / scale + lead : null;
  }
  if (!TEXT_TYPES.has(node.type.name) || node.content.size === 0) return null;
  const start = view.domAtPos(pos + 1);
  const end = view.domAtPos(pos + 1 + node.content.size);
  const range = view.dom.ownerDocument.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  const [first] = range.getClientRects();
  return first ? (first.bottom - top) / scale : null;
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
  const measuring = { view, scale, placement: { pos } };
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  const block: LayoutBlock = {
    node,
    height: element.getBoundingClientRect().height / scale,
    marginTop: px(style?.marginTop ?? ''),
    marginBottom: px(style?.marginBottom ?? ''),
    leadLineHeight: leadLineHeight(measuring, node, pos),
    measurement: measureContent(measuring, { node, relative: 0 }),
  };
  if (options.cache) {
    const key = element.dataset[MEASURE_KEY];
    cacheEntries
      .get(options.cache)
      ?.entries.set(node, { block, placement: measuring.placement, key });
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
