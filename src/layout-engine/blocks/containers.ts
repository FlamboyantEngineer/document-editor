// Blocks that hold blocks: lists and their items, quotes, layout sections and their columns, a
// script block's output and an embed's content. Each takes its children's geometry and the
// template's numbers, in the shape the container splitters read (`ContainerMeasurement`).

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { LayoutBlock } from '../../model/index.js';
import { findDocumentLayoutPreset } from '../../model/schema/layout-presets.js';
import {
  type BlockContext,
  type BlockParent,
  isLaid,
  type Laid,
  laid,
  layChildren,
} from './context.js';
import { type ContainerBox, stackContainer, withoutMargins } from './stack.js';

// A task item's box is 0.9em tall and sits 0.2em down; the item is at least that tall.
const TASK_BOX_EM = 1.1;

// The two layout presets the stylesheet gives tracks of their own; any other takes equal columns.
const PRESET_TRACKS = new Set(['third-two-thirds', 'two-thirds-third']);

function container(
  node: ProseMirrorNode,
  blocks: readonly LayoutBlock[],
  box: ContainerBox,
): LayoutBlock {
  const stacked = stackContainer(blocks, box);
  return {
    node,
    height: stacked.height,
    marginTop: stacked.marginTop,
    marginBottom: stacked.marginBottom,
    measurement: { children: stacked.children, overhead: stacked.overhead },
  };
}

/** The lines of the text's size an empty script block keeps, as the stylesheet's minimum height. */
const EMPTY_SCRIPT_LINES = 1.5;

const NO_BOX: ContainerBox = { marginTop: 0, marginBottom: 0, top: 0, bottom: 0 };

interface StackAt {
  readonly width: number;
  readonly parent: BlockParent;
  readonly box: ContainerBox;
  /** Changes the children's margins where the stylesheet zeroes them. */
  readonly adjust?: ((blocks: LayoutBlock[]) => LayoutBlock[]) | undefined;
}

function stacked(context: BlockContext, node: ProseMirrorNode, at: StackAt): Laid {
  const children = layChildren(context, node, at);
  if (isLaid(children)) return children;
  const blocks = at.adjust ? at.adjust(children.blocks) : children.blocks;
  return laid(container(node, blocks, at.box));
}

/** A list item: its blocks, a checklist item's beside its box. */
function layListItem(context: BlockContext, node: ProseMirrorNode, last: boolean): Laid {
  const isTask = node.attrs.checked !== null && node.attrs.checked !== undefined;
  const flush = (blocks: LayoutBlock[]) => {
    const end = blocks.at(-1);
    return last && end ? [...blocks.slice(0, -1), withoutMargins(end, 'bottom')] : blocks;
  };
  // A checklist item's content is a flex item, whose children's margins stay inside it.
  const box = isTask ? { ...NO_BOX, contains: true } : NO_BOX;
  const result = stacked(context, node, {
    width: context.place.width,
    parent: 'list-item',
    box,
    adjust: flush,
  });
  if (!result.ok || !isTask) return result;
  const minimum = TASK_BOX_EM * context.metrics.em;
  return laid({ ...result.block, height: Math.max(result.block.height, minimum) });
}

/** A bulleted or numbered list: its items indented by the template's indentation. */
export function layList(context: BlockContext, list: ProseMirrorNode): Laid {
  const { metrics, place } = context;
  const width = place.width - metrics.list.indent;
  const blocks: LayoutBlock[] = [];
  for (let index = 0; index < list.childCount; index += 1) {
    const item = list.child(index);
    const itemContext = { ...context, place: { ...place, width }, parent: 'other' as const };
    const result = layListItem(itemContext, item, index === list.childCount - 1);
    if (!result.ok) return result;
    blocks.push(result.block);
  }
  const box = {
    marginTop: metrics.list.before,
    marginBottom: metrics.list.after,
    top: 0,
    bottom: 0,
  };
  return laid(container(list, blocks, box));
}

/** A quote: its blocks indented on both sides, with the stylesheet's margins above and below. */
export function layQuote(context: BlockContext, node: ProseMirrorNode): Laid {
  const { quote } = context.metrics;
  const box = { marginTop: quote.before, marginBottom: quote.after, top: 0, bottom: 0 };
  const width = context.place.width - 2 * quote.indent;
  return stacked(context, node, { width, parent: 'other', box });
}

/** A script block's output or an embed's content: its blocks as they stand. */
export function layPlainContainer(context: BlockContext, node: ProseMirrorNode): Laid {
  // An empty script block keeps a line and a half of the text's size, which the message that it
  // produced nothing sits in; the message is the editor's, never content, and adds no height.
  if (!node.childCount) {
    return laid({
      node,
      height: EMPTY_SCRIPT_LINES * context.metrics.em,
      marginTop: 0,
      marginBottom: 0,
    });
  }
  return stacked(context, node, { width: context.place.width, parent: 'other', box: NO_BOX });
}

/** A template block: the blocks its markup rendered, stored in it; nothing when it holds none. */
export function layTemplateBlock(context: BlockContext, node: ProseMirrorNode): Laid {
  return stacked(context, node, { width: context.place.width, parent: 'other', box: NO_BOX });
}

/** The relative widths of a layout section's columns. */
function columnTracks(node: ProseMirrorNode): number[] {
  const preset = String(node.attrs.preset ?? '');
  const own = PRESET_TRACKS.has(preset) ? (findDocumentLayoutPreset(preset)?.widths ?? []) : [];
  // A preset's tracks stand, and share the width, even when fewer columns fill them, as the
  // stylesheet's grid template keeps them; a column past them takes an equal share.
  return Array.from(
    { length: Math.max(own.length, node.childCount) },
    (_, index) => own[index] ?? 1,
  );
}

function layColumn(context: BlockContext, column: ProseMirrorNode, width: number): Laid {
  const { columnPadding, columnBorder } = context.metrics.layout;
  const edge = columnPadding + columnBorder;
  const flush = (blocks: LayoutBlock[]) =>
    blocks.map((block, index) => {
      if (blocks.length === 1) return withoutMargins(block, 'both');
      if (index === 0) return withoutMargins(block, 'top');
      return index === blocks.length - 1 ? withoutMargins(block, 'bottom') : block;
    });
  const box = { marginTop: 0, marginBottom: 0, top: edge, bottom: edge };
  return stacked(context, column, {
    width: width - 2 * edge,
    parent: 'column',
    box,
    adjust: flush,
  });
}

/** A layout section: its columns side by side at their tracks' widths, as tall as the tallest. */
export function layLayoutSection(context: BlockContext, node: ProseMirrorNode): Laid {
  const { gap, after } = context.metrics.layout;
  const tracks = columnTracks(node);
  const total = tracks.reduce((sum, track) => sum + track, 0) || 1;
  const free = Math.max(0, context.place.width - gap * Math.max(0, tracks.length - 1));
  const columns: LayoutBlock[] = [];
  for (let index = 0; index < node.childCount; index += 1) {
    const result = layColumn(context, node.child(index), (free * (tracks[index] ?? 1)) / total);
    if (!result.ok) return result;
    columns.push(result.block);
  }
  const height = Math.max(0, ...columns.map((column) => column.height));
  return laid({
    node,
    height,
    marginTop: 0,
    marginBottom: after,
    measurement: {
      children: columns.map((column) => ({
        top: 0,
        bottom: height,
        measurement: column.measurement,
      })),
      overhead: 0,
    },
  });
}
