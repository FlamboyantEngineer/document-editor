// Splits a block that holds other blocks (a list, a list item, a quote or a script block's output)
// at a child boundary, or through the child that crosses the page's foot when that child splits
// itself. The editor measures where each child sits; this module only decides, so it reads no DOM.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { continuationPlaceholder, isContinuationPlaceholder } from './fragments.js';
import type { LayoutBlock, SplitBlock, SplitContext } from './page-layout.js';
import { splitPartOf } from './split-part.js';
import { splitParagraphWith } from './text-split.js';

/** Where a child sits, measured from the top of its container fragment's first child. */
export interface ChildLayout {
  readonly top: number;
  readonly bottom: number;
  /** The child's own measurement, for its split. */
  readonly measurement?: unknown;
}

/** What the editor measured a container's layout from: one layout per child, in order. */
export interface ContainerMeasurement {
  readonly children: readonly ChildLayout[];
  /**
   * The height the container takes beyond its children's span, such as its padding, which each of
   * its fragments takes again; 0 by default.
   */
  readonly overhead?: number | undefined;
  /**
   * For a table held with its caption, the caption's box, which a later part opening with a body
   * row does not show; 0 by default.
   */
  readonly caption?: number | undefined;
  /**
   * For an object held with its caption, how much taller a later part's caption is, showing the
   * caption's text and the continued suffix, than the caption: the room a later part takes beyond
   * the first's (DOCE-PAGINATION-11.2); 0 by default.
   */
  readonly continuedCaption?: number | undefined;
  /** A continuation's actual repeated header rows, including zero when it repeats none. */
  readonly tableHeaderRows?: number | undefined;
}

/** Whether a layout block carries a container measurement. */
export function isContainerMeasurement(value: unknown): value is ContainerMeasurement {
  return Array.isArray((value as Partial<ContainerMeasurement> | null)?.children);
}

/** The height a measured container takes beyond its children's span. */
export function containerOverhead(measurement: ContainerMeasurement): number {
  const overhead = measurement.overhead ?? 0;
  return Number.isFinite(overhead) ? Math.max(0, overhead) : 0;
}

type ChildSplit = (block: LayoutBlock, height: number, context: SplitContext) => SplitBlock | null;

interface ChildrenSplit {
  /** The index of the child that crosses the page's foot. */
  index: number;
  /** The child split in two, when it split. */
  splitChild: ProseMirrorNode | null;
  head: ProseMirrorNode[];
  headLayouts: ChildLayout[];
  tail: ProseMirrorNode[];
  tailLayouts: ChildLayout[];
  /** The second fragment's height. */
  tailHeight: number;
}

function shift(layouts: readonly ChildLayout[], by: number): ChildLayout[] {
  return layouts.map((layout) => ({ ...layout, top: layout.top - by, bottom: layout.bottom - by }));
}

function stack(blocks: readonly LayoutBlock[]): ChildLayout[] {
  let top = 0;
  return blocks.map((block) => {
    const layout = { top, bottom: top + block.height, measurement: block.measurement };
    top = layout.bottom;
    return layout;
  });
}

const defaultChildSplit: ChildSplit = (block, height, context) => {
  const rule = Object.hasOwn(context.rules, block.node.type.name)
    ? context.rules[block.node.type.name]
    : undefined;
  // A block its rule sizes is moved whole, never split (DOCE-PAGINATION-14.1).
  return (!rule?.size && rule?.split?.(block, height, context)) || null;
};

interface SplitRequest {
  readonly block: LayoutBlock;
  readonly fitting: number;
  readonly context: SplitContext;
}

// Splits through the child that crosses the page's foot, keeping its first fragment on the page.
function splitThroughChild(request: SplitRequest, index: number, splitChild: ChildSplit) {
  const children = request.block.node.children;
  const layouts = (request.block.measurement as ContainerMeasurement).children;
  const child = children[index];
  const layout = layouts[index];
  if (!child || !layout || request.fitting - layout.top <= 0) return null;
  const childBlock = {
    node: child,
    height: layout.bottom - layout.top,
    marginTop: 0,
    marginBottom: 0,
    measurement: layout.measurement,
  };
  const parts = splitChild(childBlock, request.fitting - layout.top, request.context);
  if (!parts?.tail.length) return null;
  const tailLayouts = stack(parts.tail);
  const tailHeight = tailLayouts.at(-1)?.bottom ?? 0;
  const headLayout = {
    top: layout.top,
    bottom: layout.top + parts.head.height,
    measurement: parts.head.measurement,
  };
  return {
    index,
    splitChild: child,
    head: [...children.slice(0, index), parts.head.node],
    headLayouts: [...layouts.slice(0, index), headLayout],
    tail: [...parts.tail.map((part) => part.node), ...children.slice(index + 1)],
    tailLayouts: [...tailLayouts, ...shift(layouts.slice(index + 1), layout.bottom - tailHeight)],
    tailHeight: request.block.height - layout.bottom + tailHeight,
  };
}

function splitChildren(request: SplitRequest, splitChild: ChildSplit): ChildrenSplit | null {
  const { block, fitting } = request;
  const children = block.node.children;
  if (!isContainerMeasurement(block.measurement)) return null;
  const layouts = block.measurement.children;
  if (layouts.length !== children.length) return null;
  const room = fitting - containerOverhead(block.measurement);
  const index = layouts.findIndex((layout) => layout.bottom > room);
  if (index < 0) return null;
  const through = splitThroughChild({ ...request, fitting: room }, index, splitChild);
  if (through || index === 0) return through;
  return {
    index,
    splitChild: null,
    head: children.slice(0, index),
    headLayouts: layouts.slice(0, index),
    tail: children.slice(index),
    tailLayouts: shift(layouts.slice(index), layouts[index]?.top ?? 0),
    tailHeight: block.height - (layouts[index]?.top ?? 0),
  };
}

type Attrs = Record<string, unknown>;

// The container's two fragments as layout blocks: the first ends with the last child it keeps, the
// second takes the rest of the height and starts a page.
function fragments(
  request: SplitRequest,
  split: ChildrenSplit,
  attrs: { head: Attrs; tail: Attrs },
) {
  const { block } = request;
  const { node } = block;
  const part = splitPartOf(node) ?? 0;
  const overhead = isContainerMeasurement(block.measurement)
    ? containerOverhead(block.measurement)
    : 0;
  const headHeight = (split.headLayouts.at(-1)?.bottom ?? 0) + overhead;
  return {
    head: {
      ...block,
      node: node.type.create(
        { ...node.attrs, ...attrs.head, splitPartIndex: part },
        split.head,
        node.marks,
      ),
      height: Math.max(1, headHeight),
      measurement: { children: split.headLayouts, overhead },
    },
    tail: [
      {
        ...block,
        node: node.type.create(
          { ...node.attrs, ...attrs.tail, splitPartIndex: part + 1 },
          split.tail,
          node.marks,
        ),
        height: Math.max(1, split.tailHeight),
        breakBefore: true,
        measurement: { children: split.tailLayouts, overhead },
      },
    ],
  };
}

/**
 * Splits a measured block of blocks, such as a quote or a script block's output, between or through
 * its children.
 */
export function splitContainer(
  block: LayoutBlock,
  fitting: number,
  context: SplitContext,
): SplitBlock | null {
  const request = { block, fitting, context };
  const split = splitChildren(request, defaultChildSplit);
  return split ? fragments(request, split, { head: {}, tail: {} }) : null;
}

// A paragraph's second fragment in a list item keeps at least three lines, one more than elsewhere
// (DOCE-PAGINATION-4.2); it is laid out and drawn at the item's own indent.
const splitParagraphInItem = splitParagraphWith(3);

const splitItemChild: ChildSplit = (block, height, context) =>
  block.node.type.name === 'paragraph'
    ? splitParagraphInItem(block, height)
    : defaultChildSplit(block, height, context);

/** Splits a measured list item between or through its children. */
export function splitListItem(
  block: LayoutBlock,
  fitting: number,
  context: SplitContext,
): SplitBlock | null {
  const request = { block, fitting, context };
  const split = splitChildren(request, splitItemChild);
  if (!split || !split.head.some((child) => !isContinuationPlaceholder(child))) return null;
  if (!split.tail.some((child) => !isContinuationPlaceholder(child))) return null;
  const opensWithParagraph = split.tail[0]?.type.name === 'paragraph';
  if (!opensWithParagraph) {
    const placeholder = continuationPlaceholder(block.node.type.schema);
    if (!placeholder) return null;
    split.tail.unshift(placeholder);
    split.tailLayouts.unshift({ top: 0, bottom: 0 });
  }
  const continued = !opensWithParagraph || split.splitChild?.type.name === 'paragraph';
  return fragments(request, split, {
    head: {},
    tail: continued ? { orphanedListContinuation: true } : {},
  });
}

function listStart(node: ProseMirrorNode): number {
  const start = Number(node.attrs.order);
  return Number.isInteger(start) && start > 0 ? start : 1;
}

/** Splits a measured list between or through its items; an ordered list's second part numbers on. */
export function splitList(
  block: LayoutBlock,
  fitting: number,
  context: SplitContext,
): SplitBlock | null {
  const request = { block, fitting, context };
  const split = splitChildren(request, defaultChildSplit);
  if (!split) return null;
  const ordered = block.node.type.name === 'ordered_list';
  const tail = ordered ? { order: listStart(block.node) + split.index } : {};
  return fragments(request, split, { head: {}, tail });
}
