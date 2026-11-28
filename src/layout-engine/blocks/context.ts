// What each block's geometry is computed in: the options, the place and the template's numbers, and
// a way to lay out a child, so the modules for each kind of block need not import one another.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { LayoutBlock } from '../../model/index.js';
import type { BlockMetrics } from './metrics.js';
import type { BlockGeometry, BlockLayoutOptions, BlockPlace } from './types.js';

/** What holds a block, where the stylesheet changes a child's margins. */
export type BlockParent = 'page' | 'list-item' | 'cell' | 'column' | 'region' | 'other';

/** A block laid out, or why it cannot be. */
export type Laid = BlockGeometry;

/** A block's geometry context. */
export interface BlockContext {
  readonly options: BlockLayoutOptions;
  readonly place: Required<Pick<BlockPlace, 'width'>> & BlockPlace;
  readonly metrics: BlockMetrics;
  readonly parent: BlockParent;
  /** Lays out a child at a width, held by a parent. */
  readonly child: (node: ProseMirrorNode, at: { width: number; parent: BlockParent }) => Laid;
}

/** A block laid out. */
export function laid(block: LayoutBlock): Laid {
  return { ok: true, block };
}

/** A block that takes no room, as one the engine cannot lay out does. */
export function noRoom(node: ProseMirrorNode): LayoutBlock {
  return { node, height: 0, marginTop: 0, marginBottom: 0 };
}

/** A block the engine cannot lay out yet. */
export function notLaid(node: ProseMirrorNode, reason: string): Laid {
  return { ok: false, node, reason };
}

/**
 * A node's children, laid out in order, or the first that cannot be. With `onRefused`, a child that
 * cannot be laid out takes no room instead, and is told of (DOCE-PAGINATION-14.4).
 */
export function layChildren(
  context: BlockContext,
  node: ProseMirrorNode,
  at: { width: number; parent: BlockParent },
): { readonly blocks: LayoutBlock[] } | Laid {
  const blocks: LayoutBlock[] = [];
  let failed: Laid | null = null;
  node.forEach((child) => {
    if (failed) return;
    const result = context.child(child, at);
    if (result.ok) blocks.push(result.block);
    else if (!context.options.onRefused) failed = result;
    else {
      context.options.onRefused(result.node, result.reason);
      blocks.push(noRoom(child));
    }
  });
  return failed ?? { blocks };
}

/** Whether a children result is a failure. */
export function isLaid(value: { readonly blocks: LayoutBlock[] } | Laid): value is Laid {
  return 'ok' in value;
}
