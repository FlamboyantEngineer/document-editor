// Math as the engine placed it (DOCE-PAGINATION-12.11): each math node the text layout engine laid
// out from its layout gets a node decoration with its box and scale as hooks, and the layout in its
// spec, which the math views draw as SVG. A viewer or a print reads the same placements from the
// pages' layout, so every renderer draws the equation at the box the pages were laid out with.

import { PluginKey } from 'prosemirror-state';
import { mathDrawingHooks, type MathDrawingSpec } from '../engine/math-drawing.js';
import { isMath } from '../engine/math-typeset.js';
import {
  placementsPlugin,
  type PlacementsSource,
  type PlacementsState,
} from './engine-placements.js';

/** The engine math's key: its state is the decorations placing each equation. */
const engineMathKey = new PluginKey<PlacementsState>('engine-math');

/**
 * Draws each equation at the box and scale the engine placed it at. The engine places math as it
 * lays the pages out, after a transaction is applied, so the decorations are read again when the
 * view draws a state whose placements moved since (`mathVersion`).
 */
export const engineMath = (source: PlacementsSource) =>
  placementsPlugin(source, {
    key: engineMathKey,
    holds: isMath,
    decorate(node, engine) {
      const placed = engine.mathOf(node);
      if (!placed) return null;
      const spec: MathDrawingSpec = { mathDrawing: placed };
      return { attrs: mathDrawingHooks(placed), spec };
    },
    placed: (engine) => engine?.mathVersion?.() ?? 0,
  });

/** The engine's placement of each math node of a pages' state, by position. */
export function placedMath(
  state: Parameters<typeof engineMathKey.getState>[0],
): ReadonlyMap<number, MathDrawingSpec['mathDrawing']> {
  const set = engineMathKey.getState(state)?.decorations;
  const placed = new Map<number, MathDrawingSpec['mathDrawing']>();
  for (const decoration of set?.find() ?? []) {
    const spec = decoration.spec as Partial<MathDrawingSpec>;
    if (spec.mathDrawing) placed.set(decoration.from, spec.mathDrawing);
  }
  return placed;
}
