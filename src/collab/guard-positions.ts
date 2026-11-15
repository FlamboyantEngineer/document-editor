import * as Y from '@y/y';
import * as delta from 'lib0/delta';
import type { Node } from 'prosemirror-model';
import type { AnyDelta } from './delta.js';

interface Segment {
  readonly pm: number;
  readonly y: number;
  readonly isText: boolean;
}

interface Place {
  readonly type: Y.Type;
  readonly start: number;
  readonly end: number;
  readonly size: number;
  readonly ySize: number;
  readonly segments: readonly Segment[];
  readonly parent: Place | null;
}

function lastBefore<T>(
  values: readonly T[],
  target: number,
  valueOf: (value: T) => number,
): T | undefined {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    const value = values[mid];
    if (value && valueOf(value) <= target) low = mid + 1;
    else high = mid;
  }
  return values[low - 1];
}

function childrenOf(type: Y.Type): Y.Type[] {
  const children: Y.Type[] = [];
  const value = type.toDelta() as unknown as AnyDelta;
  for (let op = value.children.start; op !== null; op = op.next) {
    if (!delta.$insertOp.check(op)) continue;
    for (const child of op.insert as unknown[]) {
      if (!(child instanceof Y.Type)) throw new Error('Unexpected shared child.');
      children.push(child);
    }
  }
  return children;
}

function buildPlaces(root: Y.Type, doc: Node) {
  const ordered: Place[] = [];
  const byType = new Map<Y.Type, Place>();
  const visit = ({
    node,
    type,
    start,
    parent,
  }: {
    node: Node;
    type: Y.Type;
    start: number;
    parent: Place | null;
  }) => {
    const segments: Segment[] = [];
    let ySize = 0;
    node.forEach((child, offset) => {
      segments.push({ pm: offset, y: ySize, isText: child.isText });
      ySize += child.isText ? child.nodeSize : 1;
    });
    const place: Place = {
      type,
      start,
      end: start + node.content.size,
      size: node.content.size,
      ySize,
      segments,
      parent,
    };
    ordered.push(place);
    byType.set(type, place);
    let children: Y.Type[] | null = null;
    let next = 0;
    node.forEach((child, offset) => {
      if (child.isText) return;
      children ??= childrenOf(type);
      const shared = children[next++];
      if (!shared) throw new Error('Missing shared child.');
      if (!child.isLeaf)
        visit({ node: child, type: shared, start: start + offset + 1, parent: place });
    });
  };
  visit({ node: doc, type: root, start: 0, parent: null });
  return { ordered, byType };
}

/** One snapshot index translates many anchors without walking the whole document for each one. */
export function createGuardPositions(root: Y.Type, doc: Node) {
  const { ordered, byType } = buildPlaces(root, doc);
  return {
    toRelativeJSON(pos: number): unknown {
      if (!Number.isInteger(pos) || pos < 0 || pos > doc.content.size) return null;
      let place = lastBefore(ordered, pos, (entry) => entry.start);
      while (place && place.end < pos) place = place.parent ?? undefined;
      if (!place) return null;
      const local = pos - place.start;
      const segment = lastBefore(place.segments, local, (entry) => entry.pm);
      const index =
        local === place.size
          ? place.ySize
          : segment
            ? segment.y + (segment.isText ? local - segment.pm : 0)
            : 0;
      return Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(place.type, index));
    },
    fromRelativeJSON(value: unknown): number | null {
      if (!root.doc || typeof value !== 'object' || value === null) return null;
      try {
        const absolute = Y.createAbsolutePositionFromRelativePosition(
          Y.createRelativePositionFromJSON(value),
          root.doc,
        );
        if (!absolute) return null;
        const place = byType.get(absolute.type as Y.Type);
        if (!place || absolute.index < 0 || absolute.index > place.ySize) return null;
        const segment = lastBefore(place.segments, absolute.index, (entry) => entry.y);
        const local =
          absolute.index === place.ySize
            ? place.size
            : segment
              ? segment.pm + (segment.isText ? absolute.index - segment.y : 0)
              : 0;
        return place.start + local;
      } catch {
        return null;
      }
    },
  };
}
