// Canonical changes mirrored onto the paged projection, step by step, so the projection never
// waits for a layout to show an edit. A change made by a known transaction is mirrored by its
// steps; any other, such as a state the host replaced or a remote change, by the smallest
// replacement between the document shown and the new one. The selection follows from the
// canonical state, unless the projection's already maps onto it.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { EditorState, Transaction } from 'prosemirror-state';
import { Transform } from 'prosemirror-transform';
import type { FragmentRules } from '../model/index.js';
import { touchesBreak } from './projection-input.js';
import { createProjectionMap, type ProjectionMap } from './projection-map.js';
import { canonicalSelection, projectionSelection } from './selection-mirror.js';

/** The projection a change is mirrored onto. */
export interface MirrorTarget {
  readonly projection: EditorState;
  readonly map: ProjectionMap;
  readonly rules: FragmentRules;
}

/** A canonical change: from the document shown, to the new state, by `tr` when one made it. */
export interface CanonicalChange {
  readonly from: ProseMirrorNode;
  readonly canonical: EditorState;
  readonly tr: Transform | null;
}

// The smallest replacement from one document to another, as a transform.
function difference(from: ProseMirrorNode, to: ProseMirrorNode): Transform | null {
  const tr = new Transform(from);
  const start = from.content.findDiffStart(to.content);
  if (start === null) return tr;
  const end = from.content.findDiffEnd(to.content);
  let endA = end?.a ?? from.content.size;
  let endB = end?.b ?? to.content.size;
  const overlap = start - Math.min(endA, endB);
  if (overlap > 0) {
    endA += overlap;
    endB += overlap;
  }
  tr.replace(start, endA, to.slice(start, endB));
  return tr.doc.eq(to) ? tr : null;
}

/**
 * The projection transaction that mirrors a canonical change, with the map after it; null when a
 * step cannot be placed, and the pages are then laid out again instead.
 */
export function mirrorChange(
  target: MirrorTarget,
  change: CanonicalChange,
): { readonly tr: Transaction; readonly map: ProjectionMap } | null {
  const { projection } = target;
  const steps = change.tr ?? difference(change.from, change.canonical.doc);
  if (!steps) return null;
  const ptr = projection.tr;
  let map = target.map;
  let rebuild = false;
  for (const [index, step] of steps.steps.entries()) {
    const mirrored = map.mirror(step, steps.docs[index + 1] ?? steps.doc);
    if (!mirrored) return null;
    for (const each of mirrored.steps) {
      rebuild ||= touchesBreak(each, ptr.doc);
      if (ptr.maybeStep(each).failed) return null;
    }
    map = mirrored.map;
  }
  // After an edit at a page break, the map is built again from the pages, which keeps the order of
  // text inserted on both sides of the break.
  map = rebuild ? createProjectionMap(ptr.doc, target.rules) : map.on(ptr.doc);
  const { selection } = change.canonical;
  const current = steps.steps.length
    ? null
    : canonicalSelection(map, projection.selection, change.canonical.doc);
  if (!current?.eq(selection)) {
    const near = projection.selection.map(ptr.doc, ptr.mapping);
    ptr.setSelection(projectionSelection(map, selection, near));
  }
  return { tr: ptr, map };
}
