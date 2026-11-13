// Splits a layout section across pages: each column splits at the same height, between or through
// its blocks, so the first fragment holds the top of every column and the second the rest. A
// column with nothing on one side holds an empty paragraph there, which joining drops. The editor
// measures where each column's blocks sit; this module only decides, so it reads no DOM.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import {
  type ChildLayout,
  containerOverhead,
  isContainerMeasurement,
  splitContainer,
} from './container-split.js';
import { isContinuationPlaceholder } from './fragments.js';
import type { LayoutBlock, SplitBlock, SplitContext } from './page-layout.js';

// One side of a split column: its blocks, and where they sit.
interface ColumnPart {
  readonly content: readonly ProseMirrorNode[];
  readonly height: number;
  readonly measurement: unknown;
}

interface ColumnSplit {
  readonly column: ProseMirrorNode;
  readonly head: ColumnPart | null;
  readonly tail: ColumnPart | null;
}

function childrenOf(node: ProseMirrorNode): ProseMirrorNode[] {
  const children: ProseMirrorNode[] = [];
  node.forEach((child) => children.push(child));
  return children;
}

// A column's own height: its blocks' span and its padding, not the height a grid stretched it to
// beside a taller column.
function columnHeight({ top, bottom, measurement }: ChildLayout): number {
  if (!isContainerMeasurement(measurement)) return bottom - top;
  return (measurement.children.at(-1)?.bottom ?? 0) + containerOverhead(measurement);
}

function whole(column: ProseMirrorNode, layout: ChildLayout): ColumnPart {
  return {
    content: childrenOf(column),
    height: columnHeight(layout),
    measurement: layout.measurement,
  };
}

function part(block: LayoutBlock): ColumnPart {
  return { content: childrenOf(block.node), height: block.height, measurement: block.measurement };
}

// A column split at the height the section has: whole on the first page when it fits, through its
// blocks when they split there, and otherwise whole on the next.
function splitColumn(
  { column, layout }: { column: ProseMirrorNode; layout: ChildLayout },
  room: number,
  context: SplitContext,
): ColumnSplit {
  const height = columnHeight(layout);
  const fitting = room - layout.top;
  if (height <= fitting) return { column, head: whole(column, layout), tail: null };
  const block = { node: column, height, marginTop: 0, marginBottom: 0 };
  const parts = splitContainer({ ...block, measurement: layout.measurement }, fitting, context);
  const [tail] = parts?.tail ?? [];
  if (!parts || !tail) return { column, head: null, tail: whole(column, layout) };
  return { column, head: part(parts.head), tail: part(tail) };
}

// Whether one side of a split column holds a block of its own, beyond a split's empty paragraph.
function holdsBlock(side: ColumnPart | null): boolean {
  return Boolean(side?.content.some((block) => !isContinuationPlaceholder(block)));
}

// A column holding only the empty paragraph takes its padding, as the other side measured it.
function placeholderHeight(other: ColumnPart | null): number {
  const measured = other?.measurement;
  return isContainerMeasurement(measured) ? containerOverhead(measured) : 0;
}

function columnNode(column: ProseMirrorNode, content: readonly ProseMirrorNode[] | undefined) {
  const placeholder = column.type.schema.nodes.paragraph?.create();
  const children = content ?? (placeholder ? [placeholder] : []);
  return column.type.create(column.attrs, children, column.marks);
}

function partIndex(node: ProseMirrorNode): number {
  const index = node.attrs.splitPartIndex as unknown;
  return typeof index === 'number' && Number.isInteger(index) && index >= 0 ? index : 0;
}

type Side = 'head' | 'tail';

// One fragment of the section: its columns' parts on that side, as tall as its tallest column.
function sectionPart(block: LayoutBlock, splits: readonly ColumnSplit[], side: Side) {
  const { node } = block;
  const overhead = isContainerMeasurement(block.measurement)
    ? containerOverhead(block.measurement)
    : 0;
  const layouts: ChildLayout[] = splits.map((split) => {
    const own = split[side];
    const other = split[side === 'head' ? 'tail' : 'head'];
    const height = own?.height ?? placeholderHeight(other);
    const measurement = own?.measurement ?? {
      children: [{ top: 0, bottom: 0 }],
      overhead: height,
    };
    return { top: 0, bottom: height, measurement };
  });
  const content = splits.map((split) => columnNode(split.column, split[side]?.content));
  const index = partIndex(node) + (side === 'tail' ? 1 : 0);
  return {
    ...block,
    node: node.type.create({ ...node.attrs, splitPartIndex: index }, content, node.marks),
    height: Math.max(1, Math.max(0, ...layouts.map((layout) => layout.bottom)) + overhead),
    measurement: { children: layouts, overhead },
  };
}

/**
 * Splits a measured layout section (`ContainerMeasurement`: where each column sits, each with its
 * own blocks' layouts) by splitting every column at the height; null when no column has a block
 * of its own that fits there, or none has one left for the next page.
 */
export function splitLayoutSection(
  block: LayoutBlock,
  fitting: number,
  context: SplitContext,
): SplitBlock | null {
  const { node, measurement } = block;
  if (!isContainerMeasurement(measurement)) return null;
  const columns = childrenOf(node);
  if (!columns.length || measurement.children.length !== columns.length) return null;
  const room = fitting - containerOverhead(measurement);
  const splits = columns.map((column, index) => {
    const layout = measurement.children[index] ?? { top: 0, bottom: 0 };
    return splitColumn({ column, layout }, room, context);
  });
  // A side holding only the empty paragraphs of an earlier split places nothing: splitting it off
  // would leave the same section for the next page, page after page.
  if (!splits.some((split) => holdsBlock(split.head))) return null;
  if (!splits.some((split) => holdsBlock(split.tail))) return null;
  const tail = sectionPart(block, splits, 'tail');
  return {
    head: sectionPart(block, splits, 'head'),
    tail: [{ ...tail, breakBefore: true }],
  };
}
