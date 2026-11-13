// The canonical state's decorations, drawn on the pages. Plugins that decorate (search, proofing,
// comments, changes) run on the canonical state, where every edit is made; the projection draws
// what they draw, mapped onto its pages. A decoration on content the page transform drops, such
// as a repeated header row's copy, is not drawn there.

import { type EditorState, Plugin } from 'prosemirror-state';
import { Decoration, type DecorationAttrs, DecorationSet } from 'prosemirror-view';
import type { ProjectionMap } from './projection-map.js';

/** What the drawn decorations read: the canonical state and the map onto the projection. */
export interface DecorationSource {
  canonical(): EditorState;
  map(): ProjectionMap;
}

// Each canonical set as mapped onto one projection map, so an unchanged set maps once.
const mapped = new WeakMap<DecorationSet, { map: ProjectionMap; set: DecorationSet }>();

// What ProseMirror keeps of a decoration and does not type: whether it is inline, and its attributes.
interface DecorationParts {
  readonly inline: boolean;
  readonly type: { readonly attrs?: DecorationAttrs };
}

function isNodeDecoration(decoration: Decoration): boolean {
  const { inline, type } = decoration as unknown as DecorationParts;
  return !inline && type.attrs !== undefined && decoration.from < decoration.to;
}

const nodeDecorations = (set: DecorationSet) => set.find().filter(isNodeDecoration).length;

// A node decoration on a block the pages split: drawn on each part, since mapped it would span
// both parts and the page chrome between them, which is no single node, and so be drawn on none.
function splitParts(decoration: Decoration, map: ProjectionMap): Decoration[] {
  if (!isNodeDecoration(decoration)) return [];
  const { type } = decoration as unknown as DecorationParts;
  const from = map.toProjection(decoration.from, 1);
  const to = map.toProjection(decoration.to, -1);
  const doc = map.projection;
  const first = from === null ? null : doc.nodeAt(from);
  if (from === null || to === null || !first || from + first.nodeSize >= to) return [];
  const depth = doc.resolve(from).depth;
  const parts: Decoration[] = [];
  doc.nodesBetween(from, to, (node, pos) => {
    if (node.type !== first.type || doc.resolve(pos).depth !== depth) return true;
    const inside = map.toCanonical(pos + 1);
    const continues = inside !== null && inside > decoration.from && inside < decoration.to;
    if (continues && pos + node.nodeSize <= to) {
      parts.push(Decoration.node(pos, pos + node.nodeSize, type.attrs ?? {}, decoration.spec));
    }
    return false;
  });
  return parts;
}

function onProjection(set: DecorationSet, map: ProjectionMap): DecorationSet {
  const cached = mapped.get(set);
  if (cached?.map === map) return cached.set;
  const moved = set.map(map.toProjectionMapping(), map.projection);
  // Only a node decoration the mapping dropped is looked for on the parts of a split block.
  const dropped = nodeDecorations(moved) < nodeDecorations(set);
  const split = dropped ? set.find().flatMap((decoration) => splitParts(decoration, map)) : [];
  const projected = split.length > 0 ? moved.add(map.projection, split) : moved;
  mapped.set(set, { map, set: projected });
  return projected;
}

// The sets drawn last and the set they made, kept while the same sets are drawn on the same pages.
interface Merged {
  readonly doc: EditorState['doc'];
  readonly sets: readonly DecorationSet[];
  readonly set: DecorationSet;
}

const sameSets = (left: readonly DecorationSet[], right: readonly DecorationSet[]) =>
  left.length === right.length && left.every((set, index) => set === right[index]);

/**
 * A projection plugin that draws every decoration the canonical state's plugins draw. The sets are
 * merged again only when one of them or the pages change, not for each state of the pages, such as
 * a selection's (DOCE-PAGINATION-7.13).
 */
export function canonicalDecorations(source: DecorationSource): Plugin {
  let merged: Merged | null = null;
  return new Plugin({
    props: {
      decorations(state) {
        const map = source.map();
        if (state.doc !== map.projection) return null;
        const canonical = source.canonical();
        const sets: DecorationSet[] = [];
        for (const plugin of canonical.plugins) {
          const set = plugin.props.decorations?.call(plugin, canonical);
          if (set instanceof DecorationSet && set !== DecorationSet.empty) {
            sets.push(onProjection(set, map));
          }
        }
        if (sets.length === 0) return null;
        if (sets.length === 1) return sets[0];
        if (merged?.doc === state.doc && sameSets(merged.sets, sets)) return merged.set;
        const set = DecorationSet.create(
          state.doc,
          sets.flatMap((each) => each.find()),
        );
        merged = { doc: state.doc, sets, set };
        return set;
      },
    },
  });
}
