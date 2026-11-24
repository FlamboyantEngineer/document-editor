// Splits a node holding an object after its caption, a table's or a code block's, as its object
// splits. Each part holds a caption: the first the caption itself, a later one an empty caption
// showing its text (`continuedText`), which the pages do not edit, with the continued suffix: a
// later part is as much taller as that caption is (`continuedCaption`).

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { LayoutBlock, SplitBlock } from './page-layout.js';

type Split = (block: LayoutBlock, fitting: number) => SplitBlock | null;

/**
 * How much taller a later part's caption is than the first part's (`continuedCaption` of the
 * holder's measurement); 0 when the measurement does not say.
 */
export function continuedCaptionOf(measurement: unknown): number {
  const growth = (measurement as { continuedCaption?: unknown } | null)?.continuedCaption;
  return typeof growth === 'number' && Number.isFinite(growth) ? growth : 0;
}

// A later part with the room its caption takes beyond the first part's: in its height, and in the
// overhead each of its own later parts repeats, whose captions are already the same.
function grownBy(part: LayoutBlock, growth: number): LayoutBlock {
  if (!growth) return part;
  const measured = part.measurement as { overhead?: unknown; continuedCaption?: unknown } | null;
  if (!measured || typeof measured !== 'object') return { ...part, height: part.height + growth };
  const overhead =
    typeof measured.overhead === 'number' ? { overhead: measured.overhead + growth } : {};
  return {
    ...part,
    height: part.height + growth,
    measurement: { ...measured, ...overhead, continuedCaption: 0 },
  };
}

/** A holder split as its object splits, the holder measured by its object. */
export function splitHeldWith(splitObject: Split): Split {
  return (block, fitting) => {
    const { node } = block;
    const caption = node.firstChild;
    const object = node.lastChild;
    if (node.childCount !== 2 || !caption || !object) return null;
    const split = splitObject({ ...block, node: object }, fitting);
    if (!split) return null;
    const holder = (part: ProseMirrorNode, line: ProseMirrorNode) =>
      node.type.create({ ...node.attrs, splitPartIndex: part.attrs.splitPartIndex }, [line, part]);
    // A later part split again repeats the text its own empty caption shows.
    const shown: unknown = caption.attrs.continuedText;
    const text = typeof shown === 'string' ? shown : caption.textContent;
    const repeated = caption.type.create({ continuedText: text });
    const growth = continuedCaptionOf(block.measurement);
    return {
      head: { ...split.head, node: holder(split.head.node, caption) },
      tail: split.tail.map((part) => ({
        ...grownBy(part, growth),
        node: holder(part.node, repeated),
      })),
    };
  };
}
