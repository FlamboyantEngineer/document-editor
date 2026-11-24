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

// Where each math node laid out from its layout was placed, and those scaled below the reported
// scale (`MATH_MIN_REPORTED_SCALE`).
export function mathPlaces() {
  let placed = new WeakMap<ProseMirrorNode, PlacedMath>();
  const small = new Set<ProseMirrorNode>();
  return {
    record(node: ProseMirrorNode, at: PlacedMath) {
      placed.set(node, at);
      if (at.box.scale < MATH_MIN_REPORTED_SCALE) small.add(node);
      else small.delete(node);
    },
    /** The engine's readings of them: each node's placement, and the count in its stats. */
    reading: (stats: () => TextEngineStats) => ({
      mathOf: (node: ProseMirrorNode) => placed.get(node) ?? null,
      stats: (): TextEngineStats => ({ ...stats(), smallMath: small.size }),
    }),
    forget() {
      placed = new WeakMap();
      small.clear();
    },
  };
}
