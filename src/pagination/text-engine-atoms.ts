// The pages' text layout engine's atoms (DOCE-PAGINATION-12.10): typeset math sized from its
// layout, with where each equation was placed kept for the renderers. Nothing is measured in the
// DOM.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';
import { typesetMathOf } from '../engine/math-views.js';
import {
  createMathAtomMeasurer,
  MATH_MIN_REPORTED_SCALE,
  mathPending,
  mathWaits,
  type PlacedMath,
} from '../layout-engine/math-atoms.js';
import type { TextLayout } from '../layout-engine/text-layout.js';
import { markedFont } from '../layout-engine/typography.js';
import type { TextEngineOptions, TextEngineStats } from './text-engine-types.js';

// What math was typeset as: by the options' reader, or the math views of the view that measures
// the pages; nothing without either.
const typesetReader = (options: TextEngineOptions) =>
  options.typesetOf ?? (options.view ? typesetIn(options.view) : () => null);

// Sizes typeset math from its layout (DOCE-PAGINATION-12.10), at the font size it is drawn at, and
// math it cannot lay out with the reserved box; no other atom.
export function atomMeasurer(
  options: TextEngineOptions,
  { typography }: { typography: () => TextLayout['typography'] },
) {
  return createMathAtomMeasurer({
    layouter: options.mathLayouter ?? (() => null),
    typesetOf: typesetReader(options),
    missing: options.missing,
    sizeOf: (node, place) => {
      const style = typography()(place.parent ?? node, place.scope);
      return place.parent ? markedFont(style, node.marks).size : style.font.size;
    },
  });
}

/**
 * The math the engine gave a provisional reserved box, before its typeset answer or while its
 * glyphs load (DOCE-PAGINATION-12.13). A result laid out with any is not kept (`count` moved while
 * laying it out), and once any of them can be laid out from its layout, `settle` forgets the
 * nodes and says so, so the engine moves its version and what drew them draws them again.
 */
export function provisionalMath(options: TextEngineOptions) {
  const typesetOf = typesetReader(options);
  const layouter = options.mathLayouter ?? (() => null);
  const waiting = new Set<ProseMirrorNode>();
  let count = 0;
  let version = 0;
  return {
    note(node: ProseMirrorNode) {
      count += 1;
      waiting.delete(node);
      waiting.add(node);
      // Math deleted before it was typeset never settles: the oldest waiting are let go.
      if (waiting.size > WAITING_KEPT)
        waiting.delete(waiting.values().next().value as ProseMirrorNode);
    },
    count: () => count,
    /** Moves once any math given a provisional box can be sized; `settled` is told first. */
    version(settled: () => void): number {
      for (const node of waiting) {
        if (mathWaits({ layouter, typesetOf }, node)) continue;
        waiting.clear();
        settled();
        version += 1;
        break;
      }
      return version;
    },
  };
}

/**
 * Whether the math layouter still loads what laying a document's typeset math out needs: a promise
 * that settles once it has, which the pages wait for (DOCE-PAGINATION-14.4); null when it can lay
 * all of it out now.
 */
export function documentMathPending(
  options: TextEngineOptions,
  doc: ProseMirrorNode,
): Promise<void> | null {
  const layouter = options.mathLayouter?.();
  if (!layouter) return null;
  const typesetOf = typesetReader(options);
  const waits: Promise<void>[] = [];
  doc.descendants((node) => {
    if (node.type.name !== 'math_inline' && node.type.name !== 'math_display') return true;
    const typeset = typesetOf(node);
    const wait =
      typeset?.state === 'ready' ? mathPending(layouter, [typeset.math], !node.isInline) : null;
    if (wait) waits.push(wait);
    return false;
  });
  return waits.length ? Promise.all(waits).then(() => undefined) : null;
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

// The most equations found by element id; the least recently placed go first.
const MATH_PLACES_BY_ID = 4000;

// The most math nodes waiting for what sizes them that the engine follows; the oldest go first.
const WAITING_KEPT = 1000;

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
  const placed = new WeakMap<ProseMirrorNode, MathPlacement>();
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
      if (node.attrs.dataId) {
        byId.delete(node.attrs.dataId);
        byId.set(node.attrs.dataId, { node, at, number });
        if (byId.size > MATH_PLACES_BY_ID) byId.delete(byId.keys().next().value);
      }
      if (at.box.scale < MATH_MIN_REPORTED_SCALE) small.add(node);
      else small.delete(node);
    },
    /** The engine's readings of them: each node's placement, and the count in its stats. */
    reading: (stats: () => TextEngineStats, doc: () => ProseMirrorNode | null) => ({
      mathOf: find,
      mathVersion: () => version,
      stats: (): TextEngineStats => ({ ...stats(), smallMath: liveIn(doc(), small) }),
    }),
  };
}
