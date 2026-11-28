// Stacking a container's children as the stylesheet's block flow does: adjoining margins collapse
// to the larger, also through a block of no height between them, and a container with no padding
// or border above or below its children lets its first child's top margin and its last child's
// bottom margin through, as its own.

import type { ChildLayout, LayoutBlock } from '../../model/index.js';

/** A container's own box around its children. */
export interface ContainerBox {
  readonly marginTop: number;
  readonly marginBottom: number;
  /** Padding and border above and below the children; a margin passes through an edge of 0. */
  readonly top: number;
  readonly bottom: number;
  /** Whether its children's margins stay inside it whatever its edges, as a flex item's do. */
  readonly contains?: boolean | undefined;
}

/** A container laid out from its children. */
interface StackedContainer {
  readonly height: number;
  readonly marginTop: number;
  readonly marginBottom: number;
  /** Where each child's box sits, from the first child's top. */
  readonly children: ChildLayout[];
  /** How far the first child's box sits below the container's top, plus what is below the last. */
  readonly overhead: number;
}

// A block of no height, whose margins collapse through it with those either side.
const isEmpty = (block: LayoutBlock) => !(block.height > 0);

/**
 * Where each child's box sits from the first one's top, with the margins between them collapsed,
 * through any block of no height too, which sits where its top margin alone puts it.
 */
export function stackBoxes(blocks: readonly LayoutBlock[]): ChildLayout[] {
  const layouts: ChildLayout[] = [];
  let bottom = 0;
  // The margin collapsed since the last block with a height; null before the first.
  let pending: number | null = null;
  for (const block of blocks) {
    const top = pending === null ? 0 : bottom + Math.max(pending, block.marginTop, 0);
    if (isEmpty(block)) {
      layouts.push({ top, bottom: top, measurement: block.measurement });
      if (pending !== null) pending = Math.max(pending, block.marginTop, block.marginBottom, 0);
      continue;
    }
    bottom = top + block.height;
    pending = block.marginBottom;
    layouts.push({ top, bottom, measurement: block.measurement });
  }
  return layouts;
}

// The margins at a container's edges, through the blocks of no height at each end: at the top the
// empty first blocks' and the first block's top margin, at the bottom the last block's bottom
// margin and the empty last blocks'. When every block is empty their margins collapse into one,
// taken at the top.
function edgeMargins(blocks: readonly LayoutBlock[]): { top: number; bottom: number } {
  const first = blocks.findIndex((block) => !isEmpty(block));
  const both = (block: LayoutBlock) => Math.max(block.marginTop, block.marginBottom);
  if (first < 0) return { top: Math.max(0, ...blocks.map(both)), bottom: 0 };
  const last = blocks.findLastIndex((block) => !isEmpty(block));
  const lead = blocks.slice(0, first).map(both);
  const trail = blocks.slice(last + 1).map(both);
  return {
    top: Math.max(blocks[first]?.marginTop ?? 0, ...lead),
    bottom: Math.max(blocks[last]?.marginBottom ?? 0, ...trail),
  };
}

/** A container's height, margins and child layouts from its children and its own box. */
export function stackContainer(
  blocks: readonly LayoutBlock[],
  box: ContainerBox,
): StackedContainer {
  const children = stackBoxes(blocks);
  // The children's boxes end at the last one with a height: an empty block after it sits in the
  // margin below it.
  const span = Math.max(
    0,
    ...blocks.flatMap((block, index) => (isEmpty(block) ? [] : [children[index]?.bottom ?? 0])),
  );
  const margins = edgeMargins(blocks);
  const top = edge(box.top, margins.top, box);
  const bottom = edge(box.bottom, margins.bottom, box);
  const above = box.top + top.inside;
  const below = bottom.inside + box.bottom;
  return {
    height: above + span + below,
    marginTop: Math.max(box.marginTop, top.passed),
    marginBottom: Math.max(box.marginBottom, bottom.passed),
    children,
    overhead: above + below,
  };
}

// Where a child's margin at a container's edge goes: through an edge with no padding or border, to
// the container's own margin, or else inside it.
function edge(size: number, margin: number | undefined, box: ContainerBox) {
  const value = Math.max(0, margin ?? 0);
  const passes = !box.contains && size <= 0;
  return { inside: passes ? 0 : value, passed: passes ? value : 0 };
}

/** A block with no vertical margins, as in a header, a footer or at a column's edges. */
export function withoutMargins(block: LayoutBlock, edges: 'both' | 'top' | 'bottom'): LayoutBlock {
  return {
    ...block,
    marginTop: edges === 'bottom' ? block.marginTop : 0,
    marginBottom: edges === 'top' ? block.marginBottom : 0,
  };
}
