// Nodes drawn at the box the engine laid them out at: each gets a node decoration with its box as
// hooks, read from the engine after it lays the pages out. Edits that leave every such node as it
// was only move the decorations; any other edit, or a placement made after the state was built,
// reads them again. Math (DOCE-PAGINATION-12.11) and the nodes host rules size
// (DOCE-PAGINATION-14.2) are drawn this way.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { Plugin, type PluginKey, type Transaction } from 'prosemirror-state';
import { AddMarkStep, RemoveMarkStep, ReplaceStep } from 'prosemirror-transform';
import { Decoration, DecorationSet } from 'prosemirror-view';
import type { PagesTextEngine } from './text-engine-types.js';

/** A plugin's decorations, with the engine and counts they were read at. */
export interface PlacementsState {
  readonly engine: PagesTextEngine | null;
  readonly version: number;
  /** The engine's placement count the decorations were read at. */
  readonly placed: number;
  readonly decorations: DecorationSet;
}

/** What the placements are read from: the engine, once loaded, and a count that moves when it forgets. */
export interface PlacementsSource {
  readonly engine: () => PagesTextEngine | null;
  readonly version: () => number;
}

/** Which nodes are placed, how each is decorated, and the engine's count of placements. */
interface Placements {
  readonly key: PluginKey<PlacementsState>;
  /** Whether a node is one the engine places, placed yet or not. */
  holds(node: ProseMirrorNode, engine: PagesTextEngine | null): boolean;
  /** The node's decoration attributes and spec, or null when the engine has not placed it. */
  decorate(
    node: ProseMirrorNode,
    engine: PagesTextEngine,
  ): { readonly attrs: Record<string, string>; readonly spec: object } | null;
  /** A count that moves whenever a node is placed anew or the placements are forgotten. */
  placed(engine: PagesTextEngine | null): number;
}

function decorationsOf(doc: ProseMirrorNode, engine: PagesTextEngine | null, of: Placements) {
  if (!engine) return DecorationSet.empty;
  const found: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!of.holds(node, engine)) return !node.isText;
    const decoration = of.decorate(node, engine);
    if (decoration)
      found.push(Decoration.node(pos, pos + node.nodeSize, decoration.attrs, decoration.spec));
    return false;
  });
  return found.length ? DecorationSet.create(doc, found) : DecorationSet.empty;
}

function holdsPlaced(
  doc: ProseMirrorNode,
  range: [number, number],
  holds: (n: ProseMirrorNode) => boolean,
) {
  let found = false;
  doc.nodesBetween(range[0], range[1], (node) => {
    found ||= holds(node);
    return !found;
  });
  return found;
}

// Whether a step leaves every placed node as it was, as typing beside one does: the placements
// then only move. A step that replaces or inserts one, or changes a block, places them again.
function keepsPlaced(tr: Transaction, index: number, holds: (n: ProseMirrorNode) => boolean) {
  const step = tr.steps[index];
  if (step instanceof AddMarkStep || step instanceof RemoveMarkStep) return true;
  if (!(step instanceof ReplaceStep)) return false;
  const { from, to, slice } = step;
  let inline = !slice.openStart && !slice.openEnd;
  slice.content.descendants((node) => {
    inline &&= node.isInline && !holds(node);
    return inline;
  });
  const doc = tr.docs[index] as ProseMirrorNode;
  return inline && doc.resolve(from).parent.isTextblock && !holdsPlaced(doc, [from, to], holds);
}

/**
 * Draws each placed node at the box the engine placed it at. The engine places nodes as it lays
 * the pages out, after a transaction is applied, so the decorations are read again when the view
 * draws a state whose placements moved since.
 */
export function placementsPlugin(
  source: PlacementsSource,
  of: Placements,
): Plugin<PlacementsState> {
  const build = (doc: ProseMirrorNode): PlacementsState => {
    const engine = source.engine();
    const placed = of.placed(engine);
    return {
      engine,
      version: source.version(),
      placed,
      decorations: decorationsOf(doc, engine, of),
    };
  };
  // The decorations of a state, read again once for placements made after it was built.
  let reread: { value: PlacementsState; state: PlacementsState } | null = null;
  const shown = (doc: ProseMirrorNode, value: PlacementsState | undefined) => {
    if (!value || value.placed === of.placed(value.engine)) return value?.decorations;
    if (reread?.value !== value || reread.state.placed !== of.placed(value.engine))
      reread = { value, state: build(doc) };
    return reread.state.decorations;
  };
  return new Plugin<PlacementsState>({
    key: of.key,
    state: {
      init: (_config, state) => build(state.doc),
      apply: (tr, value) => {
        const fresh =
          value.engine !== source.engine() ||
          value.version !== source.version() ||
          value.placed !== of.placed(value.engine);
        if (fresh) return build(tr.doc);
        if (!tr.docChanged) return value;
        const holds = (node: ProseMirrorNode) => of.holds(node, value.engine);
        if (!tr.steps.every((_step, index) => keepsPlaced(tr, index, holds))) return build(tr.doc);
        return { ...value, decorations: value.decorations.map(tr.mapping, tr.doc) };
      },
    },
    props: { decorations: (state) => shown(state.doc, of.key.getState(state)) },
  });
}
