// What an agent reads before it edits: the document's elements in order, each once though the
// pages split it, with their text and the element holding them.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { textOf } from './automation-address.js';

/** An element of the document as the automation API reads it. */
export interface DescribedBlock {
  readonly elementId: string;
  /** The element's node type, such as `paragraph` or `heading`. */
  readonly type: string;
  /** Its text, each inline object as a space; a container's is its blocks' text, by lines. */
  readonly text: string;
  readonly length: number;
  /** The id of the element holding it, or null at the top. */
  readonly parentId: string | null;
}

/** The document's elements in order, with their text, each once though the pages split it. */
export function describeBlocks(doc: ProseMirrorNode): DescribedBlock[] {
  const described = new Map<string, DescribedBlock>();
  const visit = (node: ProseMirrorNode, pos: number, parentId: string | null) => {
    const id = typeof node.attrs.dataId === 'string' && node.isBlock ? node.attrs.dataId : null;
    if (id) {
      const text = node.isTextblock
        ? textOf({ node, pos }).text
        : node.textBetween(0, node.content.size, '\n', ' ');
      const known = described.get(id);
      const joined = known
        ? `${known.text}${known.type === node.type.name && node.isTextblock ? '' : '\n'}${text}`
        : text;
      described.set(id, {
        elementId: id,
        type: node.type.name,
        text: joined,
        length: joined.length,
        parentId,
      });
    }
    if (node.isTextblock) return;
    node.forEach((child, offset) => visit(child, pos + 1 + offset, id ?? parentId));
  };
  doc.forEach((child, offset) => visit(child, offset, null));
  return [...described.values()];
}
