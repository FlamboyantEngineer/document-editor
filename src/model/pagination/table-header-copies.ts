import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { splitPartOf } from './split-part.js';
import { isHeaderRow } from './table-split.js';

function headerRowId(row: ProseMirrorNode): string | null {
  const id: unknown = row.attrs.dataId;
  return typeof id === 'string' && id ? id : null;
}

/** Whether two header rows are the same original row or carry its element id. */
export function isTableHeaderCopy(original: ProseMirrorNode, copy: ProseMirrorNode): boolean {
  if (original === copy) return true;
  const id = headerRowId(original);
  return id !== null && id === headerRowId(copy);
}

/**
 * Finds the earlier occurrence of a repeated header as a document is walked in order. A split
 * shares the original row node, and editing its copies can produce new nodes with the same id.
 */
export function trackTableHeaderCopies() {
  const byNode = new WeakMap<ProseMirrorNode, number>();
  const byId = new Map<string, number>();
  return (node: ProseMirrorNode, parent: ProseMirrorNode | null, pos: number): number | null => {
    if (parent?.type.name !== 'table' || !isHeaderRow(node)) return null;
    const id = headerRowId(node);
    if ((splitPartOf(parent) ?? 0) > 0) {
      const previous = byNode.get(node) ?? (id === null ? undefined : byId.get(id));
      if (previous !== undefined) return previous;
    }
    byNode.set(node, pos);
    if (id !== null) byId.set(id, pos);
    return null;
  };
}
