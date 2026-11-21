// Stacking a container's children as the stylesheet's block flow does: adjoining margins collapse
// to the larger, and a container with no padding or border above or below its children lets its
// first child's top margin and its last child's bottom margin through, as its own.

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

/** Where each child's box sits from the first one's top, with the margins between them. */
export function stackBoxes(blocks: readonly LayoutBlock[]): ChildLayout[] {
  const layouts: ChildLayout[] = [];
  let bottom = 0;
  blocks.forEach((block, index) => {
    const previous = blocks[index - 1];
    const top = previous ? bottom + Math.max(previous.marginBottom, block.marginTop, 0) : 0;
    bottom = top + block.height;
    layouts.push({ top, bottom, measurement: block.measurement });
  });
  return layouts;
}

/** A container's height, margins and child layouts from its children and its own box. */
export function stackContainer(
  blocks: readonly LayoutBlock[],
  box: ContainerBox,
): StackedContainer {
  const children = stackBoxes(blocks);
  const span = children.at(-1)?.bottom ?? 0;
  const top = edge(box.top, blocks[0]?.marginTop, box);
  const bottom = edge(box.bottom, blocks.at(-1)?.marginBottom, box);
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
