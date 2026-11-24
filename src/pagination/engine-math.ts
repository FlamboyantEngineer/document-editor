// Math as the engine placed it (DOCE-PAGINATION-12.11): each math node the text layout engine laid
// out from its layout gets a node decoration with its box and scale as hooks, and the layout in its
// spec, which the math views draw as SVG. A viewer or a print reads the same placements from the
// pages' layout, so every renderer draws the equation at the box the pages were laid out with.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { Plugin, PluginKey, type Transaction } from 'prosemirror-state';
import { AddMarkStep, RemoveMarkStep, ReplaceStep } from 'prosemirror-transform';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { mathDrawingHooks, type MathDrawingSpec } from '../engine/math-drawing.js';
import { isMath } from '../engine/math-typeset.js';
import type { PagesTextEngine } from './text-engine-types.js';

/** The engine math's key: its state is the decorations placing each equation. */
const engineMathKey = new PluginKey<EngineMathState>('engine-math');

interface EngineMathState {
  readonly engine: PagesTextEngine | null;
  readonly version: number;
  readonly decorations: DecorationSet;
}

/** What the placements are read from: the engine, once loaded, and a count that moves when it forgets. */
interface EngineMathSource {
  readonly engine: () => PagesTextEngine | null;
  readonly version: () => number;
}

// Each math node's placement in a document, as node decorations.
function mathDecorations(doc: ProseMirrorNode, engine: PagesTextEngine | null): DecorationSet {
  if (!engine) return DecorationSet.empty;
  const found: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!isMath(node)) return !node.isText;
    const placed = engine.mathOf(node);
    if (placed) {
      const spec: MathDrawingSpec = { mathDrawing: placed };
      found.push(Decoration.node(pos, pos + node.nodeSize, mathDrawingHooks(placed), spec));
    }
    return false;
  });
  return found.length ? DecorationSet.create(doc, found) : DecorationSet.empty;
}

const holdsMath = (doc: ProseMirrorNode, from: number, to: number) => {
  let found = false;
  doc.nodesBetween(from, to, (node) => {
    found ||= isMath(node);
    return !found;
  });
  return found;
};

// Whether a step leaves every math node as it was, as typing beside math does: the placements
// then only move. A step that replaces or inserts math, or changes a block, places them again.
function keepsMath(tr: Transaction, index: number): boolean {
  const step = tr.steps[index];
  if (step instanceof AddMarkStep || step instanceof RemoveMarkStep) return true;
  if (!(step instanceof ReplaceStep)) return false;
  const { from, to, slice } = step;
  let inline = !slice.openStart && !slice.openEnd;
  slice.content.descendants((node) => {
    inline &&= node.isInline && !isMath(node);
    return inline;
  });
  const doc = tr.docs[index] as ProseMirrorNode;
  return inline && doc.resolve(from).parent.isTextblock && !holdsMath(doc, from, to);
}

/** Draws each equation at the box and scale the engine placed it at. */
export function engineMath(source: EngineMathSource): Plugin<EngineMathState> {
  const build = (doc: ProseMirrorNode): EngineMathState => {
    const engine = source.engine();
    return { engine, version: source.version(), decorations: mathDecorations(doc, engine) };
  };
  return new Plugin<EngineMathState>({
    key: engineMathKey,
    state: {
      init: (_config, state) => build(state.doc),
      apply: (tr, value) => {
        const fresh = value.engine !== source.engine() || value.version !== source.version();
        if (fresh) return build(tr.doc);
        if (!tr.docChanged) return value;
        if (!tr.steps.every((_step, index) => keepsMath(tr, index))) return build(tr.doc);
        return { ...value, decorations: value.decorations.map(tr.mapping, tr.doc) };
      },
    },
    props: { decorations: (state) => engineMathKey.getState(state)?.decorations },
  });
}

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
