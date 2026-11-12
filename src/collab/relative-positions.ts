// Document positions as Yjs relative positions, and back. A relative position names a character or
// child of a shared type, so it stays on the same text while other people edit; each editor turns
// it back into a position in its own document. In the shared document, block content is a type's
// children and inline content its characters, where every inline node other than text counts one.

import * as Y from '@y/y';
import type { Node } from 'prosemirror-model';

// A document position as a shared type and an index in it, or null when the shared document does
// not hold the document's structure there, such as before the binding has filled it.
function toTypeIndex(root: Y.Type, doc: Node, pos: number): { type: Y.Type; index: number } | null {
  const $pos = doc.resolve(pos);
  let type = root;
  for (let depth = 0; depth < $pos.depth; depth += 1) {
    const child: unknown = type.get($pos.index(depth));
    if (!(child instanceof Y.Type)) return null;
    type = child;
  }
  const parent = $pos.parent;
  if (!parent.inlineContent) return { type, index: $pos.index() };
  let index = 0;
  let offset = 0;
  const target = $pos.parentOffset;
  for (let child = 0; child < parent.childCount && offset < target; child += 1) {
    const node = parent.child(child);
    const take = node.isText ? Math.min(node.nodeSize, target - offset) : 1;
    index += take;
    offset += node.isText ? take : node.nodeSize;
  }
  return { type, index };
}

// A shared type and an index in it as a position in the document, or null when the document does
// not hold that type.
function toPosition(
  root: Y.Type,
  doc: Node,
  { type, index }: { type: Y.Type; index: number },
): number | null {
  const path = type === root ? [] : (Y.getPathTo(root, type) as unknown[]);
  let node = doc;
  let pos = 0;
  for (const step of path) {
    if (typeof step !== 'number' || step >= node.childCount) return null;
    for (let child = 0; child < step; child += 1) pos += node.child(child).nodeSize;
    node = node.child(step);
    pos += 1;
  }
  let at = pos;
  let remaining = index;
  for (let child = 0; child < node.childCount && remaining > 0; child += 1) {
    const inline = node.child(child);
    const take = node.inlineContent && inline.isText ? Math.min(inline.nodeSize, remaining) : 1;
    remaining -= take;
    at += node.inlineContent && inline.isText ? take : inline.nodeSize;
  }
  return at;
}

/**
 * A position in `doc`, the document `root` holds, as a relative position in JSON; null when `root`
 * does not hold the document's structure there.
 */
export function toRelativeJSON(root: Y.Type, doc: Node, pos: number): unknown {
  const found = toTypeIndex(root, doc, pos);
  if (!found) return null;
  const { type, index } = found;
  return Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(type, index));
}

/**
 * A relative position in JSON as a position in `doc`, the document `root` holds; null when it names
 * nothing in it, such as text no longer there or a value that is no relative position.
 */
export function fromRelativeJSON(root: Y.Type, doc: Node, json: unknown): number | null {
  if (typeof json !== 'object' || json === null) return null;
  const ydoc = root.doc;
  if (!ydoc) return null;
  let absolute: ReturnType<typeof Y.createAbsolutePositionFromRelativePosition>;
  try {
    absolute = Y.createAbsolutePositionFromRelativePosition(
      Y.createRelativePositionFromJSON(json),
      ydoc,
    );
  } catch {
    return null;
  }
  if (!absolute) return null;
  const pos = toPosition(root, doc, {
    type: absolute.type as unknown as Y.Type,
    index: absolute.index,
  });
  return pos === null || pos > doc.content.size ? null : pos;
}
