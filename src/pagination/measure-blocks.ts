// Measures laid-out blocks in an editor view for the page layout: each block's height and margins,
// where a container's children or a list of contents' rows sit, and, lazily, the height and lines
// of a text block's text between two offsets. It only reads layout, so measuring a section forces
// one layout at most. A cache (measure-cache.ts) keeps each block's measurement while its node
// stays.

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
import { childElement, elementOf } from './block-elements.js';
import {
  cachedBlock,
  type DrawnBlock,
  keepBlock,
  margins,
  type MeasureCache,
  type Placement,
  px,
} from './measure-cache.js';

// Whether a block measures provisionally: an image in it still loads and its box is not fixed by
// its size attributes or an aspect ratio, so its load may change the block's height. A lazy image
// loads at once, since the measuring view sits out of sight, where a lazy image never loads.
function isProvisional(element: HTMLElement): boolean {
  let provisional = false;
  for (const image of element.querySelectorAll('img')) {
    if (image.complete) continue;
    if (image.getAttribute('loading') === 'lazy') image.setAttribute('loading', 'eager');
    if (!hasFixedBox(image)) provisional = true;
  }
  return provisional;
}

function hasFixedBox(image: HTMLImageElement): boolean {
  if (image.getAttribute('width') && image.getAttribute('height')) return true;
  const ratio = image.ownerDocument.defaultView?.getComputedStyle(image).aspectRatio ?? '';
  return ratio.includes('/') || Boolean(image.style.aspectRatio) || Boolean(image.style.height);
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

const CONTAINER_TYPES = new Set([
  'blockquote',
  'bullet_list',
  'ordered_list',
  'list_item',
  'table',
  'script_block',
  'embed',
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

// A block drawn as an element, measured or taken from the cache.
function measureDrawn(view: EditorView, at: DrawnBlock, options: MeasureOptions): LayoutBlock {
  const cached = cachedBlock(options.cache, at);
  if (cached) return cached;
  const { node, pos, element } = at;
  const scale = options.scale && options.scale > 0 ? options.scale : 1;
  const measuring = { view, scale, placement: { pos }, rules: options.rules };
  const provisional = isProvisional(element);
  const block: LayoutBlock = {
    node,
    height: element.getBoundingClientRect().height / scale,
    ...margins(element),
    measurement: measureContent(measuring, { node, relative: 0 }),
  };
  keepBlock(options.cache, at, { block, placement: measuring.placement, scale, provisional });
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
  let element: HTMLElement | null = null;
  parent?.forEach((node, offset) => {
    const at = pos + 1 + offset;
    const drawn = childElement(view, element, { node, pos: at });
    if (drawn) blocks.push(measureDrawn(view, { node, pos: at, element: drawn }, options));
    else blocks.push(undrawnBlock(view, { node, pos }));
    element = drawn ?? element;
  });
  return blocks;
}

// The height a block drawn as no element takes, such as one whose host node view renders none,
// when its parent's line height says none.
const UNDRAWN_HEIGHT = 24;

// A block drawn as no element: one line of its parent's text, so it is never left out of the pages.
function undrawnBlock(view: EditorView, { node, pos }: { node: ProseMirrorNode; pos: number }) {
  const parent = elementOf(view, pos);
  const lineHeight = parent
    ? px(parent.ownerDocument.defaultView?.getComputedStyle(parent).lineHeight ?? '')
    : 0;
  return { node, height: lineHeight || UNDRAWN_HEIGHT, marginTop: 0, marginBottom: 0 };
}
