import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { Transform } from 'prosemirror-transform';
import { splitPartOf } from './split-part.js';

interface JoinedParts {
  readonly first: number | null;
  readonly last: number | null;
  readonly objectId: string | null;
}

export interface FacingBlocks {
  readonly previous: ProseMirrorNode;
  readonly next: ProseMirrorNode;
}

// A nested join may meet this block again at another page seam. Its numbers and any enclosed
// identity observed during the join belong to the transform, while the block is already whole.
const joinedParts = new WeakMap<Transform, WeakMap<ProseMirrorNode, JoinedParts>>();

export function partsOfJoin(tr: Transform): WeakMap<ProseMirrorNode, JoinedParts> | undefined {
  return joinedParts.get(tr);
}

function heldObjectId(node: ProseMirrorNode): string | null {
  if (node.type.name !== 'code_figure' && node.type.name !== 'table_figure') return null;
  const id = node.lastChild?.attrs.dataId as unknown;
  return typeof id === 'string' && id ? id : null;
}

function blockParts(
  node: ProseMirrorNode,
  parts?: WeakMap<ProseMirrorNode, JoinedParts>,
): JoinedParts {
  const known = parts?.get(node);
  if (known) return known;
  const index = splitPartOf(node);
  return { first: index, last: index, objectId: heldObjectId(node) };
}

/** Whether the blocks' identities or their original boundary part numbers continue each other. */
export function matchFragmentParts(
  { previous, next }: FacingBlocks,
  parts?: WeakMap<ProseMirrorNode, JoinedParts>,
): boolean {
  const left = blockParts(previous, parts);
  const right = blockParts(next, parts);
  if (left.objectId && right.objectId) return left.objectId === right.objectId;
  const id = previous.attrs.dataId as unknown;
  if (id && id === next.attrs.dataId) return true;
  return left.last !== null && right.first === left.last + 1;
}

export function rememberJoinedParts(
  tr: Transform,
  joined: ProseMirrorNode,
  { previous, next }: FacingBlocks,
): void {
  const known = partsOfJoin(tr);
  const left = blockParts(previous, known);
  const right = blockParts(next, known);
  if (left.first === null && right.last === null) return;
  const parts = known ?? new WeakMap<ProseMirrorNode, JoinedParts>();
  parts.set(joined, {
    first: left.first,
    last: right.last,
    objectId: heldObjectId(joined) ?? left.objectId ?? right.objectId,
  });
  if (!known) joinedParts.set(tr, parts);
}
