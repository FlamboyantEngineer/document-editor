// The pages' text layout engine's atoms (DOCE-PAGINATION-10.2, 12.10): measured as the pages'
// measuring view draws them, and typeset math sized from its layout where a math layouter is
// given, with where each equation was placed kept for the renderers.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';
import { typesetMathOf } from '../engine/math-views.js';
import { createDomAtomMeasurer } from '../layout-engine/dom-atoms.js';
import {
  createMathAtomMeasurer,
  MATH_MIN_REPORTED_SCALE,
  type PlacedMath,
} from '../layout-engine/math-atoms.js';
import type { TextLayout } from '../layout-engine/text-layout.js';
import { markedFont } from '../layout-engine/typography.js';
import { createDrawnAtomMeasurer } from './drawn-atoms.js';
import type { TextEngineOptions, TextEngineStats } from './text-engine-types.js';

// Measures atoms as the pages' measuring view draws them, or, without one, in a host of its own;
// typeset math from its layout where a math layouter is given (DOCE-PAGINATION-12.10), at the
// font size it is drawn at.
export function atomMeasurer(
  options: TextEngineOptions,
  { host, typography }: { host: HTMLElement; typography: () => TextLayout['typography'] },
) {
  const { view } = options;
  const inner = view
    ? createDrawnAtomMeasurer({ view, host, scale: options.scale })
    : createDomAtomMeasurer({ host });
  const { mathLayouter } = options;
  const typesetOf = options.typesetOf ?? (view ? typesetIn(view) : null);
  if (!mathLayouter || !typesetOf) return inner;
  return createMathAtomMeasurer({
    inner,
    layouter: mathLayouter,
    typesetOf,
    missing: options.missing,
    sizeOf: (node, place) => {
      const style = typography()(place.parent ?? node, place.scope);
      return place.parent ? markedFont(style, node.marks).size : style.font.size;
    },
  });
}

// What math was typeset as by the math views of the view that measures the pages, which runs the
// canonical state's plugins.
const typesetIn = (view: () => EditorView | null) => (node: ProseMirrorNode) => {
  const state = view()?.state;
  return state ? typesetMathOf(state, node) : null;
};

// Whether two placements draw the same: the same layouts at the same scale and end room.
const samePlace = (was: PlacedMath | undefined, now: PlacedMath) =>
  was?.math === now.math &&
  was.tag === now.tag &&
  was.box.scale === now.box.scale &&
  was.end === now.end;

// How many of the nodes are in a document, forgetting the others.
function liveIn(doc: ProseMirrorNode | null, nodes: Set<ProseMirrorNode>): number {
  if (!nodes.size) return 0;
  const live = new Set<ProseMirrorNode>();
  doc?.descendants((node) => {
    if (nodes.has(node)) live.add(node);
  });
  for (const node of nodes) if (!live.has(node)) nodes.delete(node);
  return live.size;
}

interface MathPlacement {
  readonly at: PlacedMath;
  readonly number: string | undefined;
}

// Where each math node laid out from its layout was placed, and those scaled below the reported
// scale (`MATH_MIN_REPORTED_SCALE`), counted in the document the engine numbers last: math edited
// or deleted since it was laid out is not. A node the pages hold is found by its element id when it
// is not the node the engine laid out but equals it, as math edited inside is: the pages and the
// canonical state each make their own copy of it.
export function mathPlaces(
  equationOf: (node: ProseMirrorNode) => string | undefined = () => undefined,
) {
  let placed = new WeakMap<ProseMirrorNode, MathPlacement>();
  const byId = new Map<unknown, MathPlacement & { node: ProseMirrorNode }>();
  const small = new Set<ProseMirrorNode>();
  const find = (node: ProseMirrorNode): PlacedMath | null => {
    const kept = placed.get(node);
    const number = equationOf(node);
    if (kept && kept.number === number) return kept.at;
    // Kept pages can still hold an edited copy after the canonical equation is renumbered.
    const same = node.attrs.dataId ? byId.get(node.attrs.dataId) : undefined;
    if (same?.node.eq(node) && (!kept || same.number === number)) return same.at;
    return kept?.at ?? null;
  };
  // Moves when a node is placed anew, so what draws the placements knows to read them again.
  let version = 0;
  return {
    record(node: ProseMirrorNode, at: PlacedMath) {
      const number = equationOf(node);
      if (!samePlace(placed.get(node)?.at, at)) version += 1;
      placed.set(node, { at, number });
      if (node.attrs.dataId) byId.set(node.attrs.dataId, { node, at, number });
      if (at.box.scale < MATH_MIN_REPORTED_SCALE) small.add(node);
      else small.delete(node);
    },
    /** The engine's readings of them: each node's placement, and the count in its stats. */
    reading: (stats: () => TextEngineStats, doc: () => ProseMirrorNode | null) => ({
      mathOf: find,
      mathVersion: () => version,
      stats: (): TextEngineStats => ({ ...stats(), smallMath: liveIn(doc(), small) }),
    }),
    forget() {
      placed = new WeakMap();
      byId.clear();
      small.clear();
      version += 1;
    },
  };
}
