// Presence by element address: a place in the document as an element id and an offset in the
// element's text, the same in every copy of the document whatever else differs, for hosts that
// share selections without a shared Yjs document (store mode).

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { EditorState } from 'prosemirror-state';

/**
 * A place in the document by address: an element, by its id, and an offset in its text, where each
 * character counts one and each inline object, such as a footnote marker, counts one; 0 in an
 * element without text.
 */
export interface PresencePoint {
  readonly elementId: string;
  readonly offset: number;
}

/** A selection by address. */
export interface PresenceRange {
  readonly anchor: PresencePoint;
  readonly head: PresencePoint;
}

const idOf = (node: ProseMirrorNode): string | null => {
  const id: unknown = node.attrs.dataId;
  return typeof id === 'string' && id !== '' ? id : null;
};

// The offset in a text block's text of a position `parentOffset` into its content.
function textOffset(block: ProseMirrorNode, parentOffset: number): number {
  let offset = 0;
  let at = 0;
  for (let index = 0; index < block.childCount && at < parentOffset; index += 1) {
    const child = block.child(index);
    const take = child.isText ? Math.min(child.nodeSize, parentOffset - at) : 1;
    offset += take;
    at += child.isText ? take : child.nodeSize;
  }
  return offset;
}

// The position `offset` into a text block's text, the block's content starting at `start`.
function textPosition(block: ProseMirrorNode, start: number, offset: number): number {
  let remaining = offset;
  let at = start;
  for (let index = 0; index < block.childCount && remaining > 0; index += 1) {
    const child = block.child(index);
    const take = child.isText ? Math.min(child.nodeSize, remaining) : 1;
    remaining -= take;
    at += child.isText ? take : child.nodeSize;
  }
  return at;
}

/** A position's address: the innermost element with an id around it; null outside every one. */
export function pointAt(doc: ProseMirrorNode, pos: number): PresencePoint | null {
  const $pos = doc.resolve(pos);
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    const elementId = idOf(node);
    if (!elementId) continue;
    const offset =
      depth === $pos.depth && node.isTextblock ? textOffset(node, $pos.parentOffset) : 0;
    return { elementId, offset };
  }
  return null;
}

/** The reader's selection by address, to share with others in store mode; null without ids. */
export function presenceSelection(state: EditorState): PresenceRange | null {
  const anchor = pointAt(state.doc, state.selection.anchor);
  const head = pointAt(state.doc, state.selection.head);
  return anchor && head ? { anchor, head } : null;
}

/** Turns addresses into positions in one document, finding each element once. */
export function addressResolver(doc: ProseMirrorNode): (point: PresencePoint) => number | null {
  let found: Map<string, { node: ProseMirrorNode; pos: number }> | null = null;
  return (point) => {
    if (!found) {
      const index = new Map<string, { node: ProseMirrorNode; pos: number }>();
      doc.descendants((node, pos) => {
        const id = idOf(node);
        if (id && !index.has(id)) index.set(id, { node, pos });
        return !node.isTextblock;
      });
      found = index;
    }
    const element = found.get(point.elementId);
    if (!element) return null;
    const start = element.pos + 1;
    if (!element.node.isTextblock) return start;
    return textPosition(element.node, start, Math.max(0, point.offset));
  };
}
