// Splits a node holding an object after its caption, a table's or a code block's, as its object
// splits. Each part holds a caption: the first the caption itself, a later one an empty caption
// showing its text (`continuedText`), which the pages do not edit.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { LayoutBlock, SplitBlock } from './page-layout.js';

type Split = (block: LayoutBlock, fitting: number) => SplitBlock | null;

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
    return {
      head: { ...split.head, node: holder(split.head.node, caption) },
      tail: split.tail.map((part) => ({ ...part, node: holder(part.node, repeated) })),
    };
  };
}
