import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { splitPartOf } from './split-part.js';
import { isHeaderRow, projectedHeaderRows } from './table-headers.js';

export type TableHeaderVisit = Parameters<Parameters<ProseMirrorNode['descendants']>[0]>;

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
 * Finds repeated headers as a document is walked in order. The original row's position is
 * available when it shares a node or an id with its copy.
 */
export function trackTableHeaderCopies() {
  const byNode = new WeakMap<ProseMirrorNode, number>();
  const byId = new Map<string, number>();
  return (pos: number, [node, , parent, index]: TableHeaderVisit) => {
    if (parent?.type.name !== 'table') return null;
    const count = projectedHeaderRows(parent);
    if (count === null ? !isHeaderRow(node) : index >= count) return null;
    const id = headerRowId(node);
    if ((splitPartOf(parent) ?? 0) > 0) {
      const previous = byNode.get(node) ?? (id === null ? undefined : byId.get(id));
      if (count !== null || previous !== undefined) return { original: previous ?? null };
    }
    byNode.set(node, pos);
    if (id !== null) byId.set(id, pos);
    return null;
  };
}
