// The pages' text layout engine's atoms (DOCE-PAGINATION-12.10): typeset math sized from its
// layout, with where each equation was placed kept for the renderers. Nothing is measured in the
// DOM.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { EditorState } from 'prosemirror-state';
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

// What math was typeset as: by the options' reader, or the math views of the state the pages are
// laid out from; nothing without either.
const typesetReader = (options: TextEngineOptions) =>
  options.typesetOf ?? (options.state ? typesetIn(options.state) : () => null);

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

// What math was typeset as by the math views of the state the pages are laid out from, which runs
// the canonical state's plugins.
const typesetIn = (source: () => EditorState | null) => (node: ProseMirrorNode) => {
  const state = source();
  return state ? typesetMathOf(state, node) : null;
};

// Whether two placements draw the same: the same layouts at the same scale and end room.
const samePlace = (was: PlacedMath | undefined, now: PlacedMath) =>
  was?.math === now.math &&
  was.tag === now.tag &&
  was.box.scale === now.box.scale &&
  was.end === now.end;

const WAITING_KEPT = 1000;
const MATH_PLACES_BY_ID = 4000;

interface MathPlacement {
  readonly node: ProseMirrorNode;
  readonly at: PlacedMath;
  readonly number: string | undefined;
}

const isSmall = (placement: MathPlacement | undefined) =>
  placement !== undefined && placement.at.box.scale < MATH_MIN_REPORTED_SCALE;

// Where each math node laid out from its layout was placed, and those scaled below the reported
// scale (`MATH_MIN_REPORTED_SCALE`), counted in the document the engine numbers last: math edited
// or deleted since it was laid out is not. A node the pages hold is found by its element id when it
// is not the node the engine laid out but equals it, as math edited inside is: the pages and the
// canonical state each make their own copy of it.
export function mathPlaces(
  equationOf: (node: ProseMirrorNode) => string | undefined = () => undefined,
) {
  let placed = new WeakMap<ProseMirrorNode, MathPlacement>();
  let byId = new Map<unknown, MathPlacement>();
  let doc: ProseMirrorNode | null = null;
  let live = new Set<ProseMirrorNode>();
  let smallMath = 0;
  let recorded = false;
  // Moves when a node is placed anew or the lookup for projected copies changes.
  let version = 0;
  const keepIn = (next: ProseMirrorNode) => {
    live = new Set();
    const indexed = new Map<unknown, MathPlacement>();
    smallMath = 0;
    next.descendants((node) => {
      if (node.type.name !== 'math_display' && node.type.name !== 'math_inline') return true;
      if (live.has(node)) return false;
      live.add(node);
      const own = placed.get(node);
      if (isSmall(own)) smallMath += 1;
      const id: unknown = node.attrs.dataId;
      const old = id ? byId.get(id) : undefined;
      // An undone edit can reuse a weakly kept placement without measuring the node again.
      const kept = old?.node.eq(node) ? old : own;
      if (id && kept) indexed.set(id, kept);
      return false;
    });
    if (indexed.size !== byId.size || [...indexed].some(([id, each]) => byId.get(id) !== each))
      version += 1;
    byId = indexed;
  };
  const find = (node: ProseMirrorNode): PlacedMath | null => {
    const kept = placed.get(node);
    const number = equationOf(node);
    if (kept && kept.number === number) return kept.at;
    // Kept pages can still hold an edited copy after the canonical equation is renumbered.
    const same = node.attrs.dataId ? byId.get(node.attrs.dataId) : undefined;
    if (same?.node.eq(node) && (!kept || same.number === number)) return same.at;
    return kept?.at ?? null;
  };
  return {
    number(next: ProseMirrorNode) {
      if (doc === next) return;
      doc = next;
      if (recorded) keepIn(next);
    },
    record(node: ProseMirrorNode, at: PlacedMath) {
      if (!recorded && doc) keepIn(doc);
      recorded = true;
      const was = placed.get(node);
      const now = { node, at, number: equationOf(node) };
      if (!samePlace(was?.at, at)) version += 1;
      placed.set(node, now);
      if (node.attrs.dataId) {
        byId.delete(node.attrs.dataId);
        byId.set(node.attrs.dataId, now);
        if (byId.size > MATH_PLACES_BY_ID) byId.delete(byId.keys().next().value);
      }
      if (live.has(node)) smallMath += Number(isSmall(now)) - Number(isSmall(was));
    },
    /** The engine's readings of them: each node's placement, and the count in its stats. */
    reading: (stats: () => TextEngineStats) => ({
      mathOf: find,
      mathVersion: () => version,
      stats: (): TextEngineStats => ({ ...stats(), smallMath }),
    }),
    forget() {
      placed = new WeakMap();
      byId.clear();
      live.clear();
      doc = null;
      smallMath = 0;
      recorded = false;
      version += 1;
    },
  };
}
