// The canonical state's decorations, drawn on the pages. Plugins that decorate (search, proofing,
// comments, changes) run on the canonical state, where every edit is made; the projection draws
// what they draw, mapped onto its pages. A decoration on content the page transform drops, such
// as a repeated header row's copy, is not drawn there.

import { type EditorState, Plugin } from 'prosemirror-state';
import { Decoration, type DecorationAttrs, DecorationSet } from 'prosemirror-view';
import { footnoteNumbersKey } from '../engine/footnote-numbers.js';
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
  if (from === null || to === null || !first || first.isLeaf || from + first.nodeSize >= to) {
    return [];
  }
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

// The parts of a leaf block the pages split, such as a list of contents: the first, where the
// block maps to, and each after it of its type, in the same kind of region, that maps to no
// canonical content, only to the block's end. Page chrome between the parts is passed over, and
// looking stops at the first block of that kind of region that holds canonical content after it.
function leafParts(decoration: Decoration, map: ProjectionMap): Decoration[] {
  const { type } = decoration as unknown as DecorationParts;
  const doc = map.projection;
  const pos = map.toProjection(decoration.from, 1);
  const node = pos === null ? null : doc.nodeAt(pos);
  if (pos === null || !node?.isLeaf) return [];
  const first = { pos, node, at: doc.resolve(pos) };
  const part = (pos: number) =>
    Decoration.node(pos, pos + first.node.nodeSize, type.attrs ?? {}, decoration.spec);
  const parts = [part(first.pos)];
  let done = false;
  doc.nodesBetween(first.pos + first.node.nodeSize, doc.content.size, (node, pos, parent) => {
    if (done) return false;
    if (parent?.type !== first.at.parent.type) return doc.resolve(pos).depth < first.at.depth;
    const end = map.toCanonical(pos + node.nodeSize, -1);
    const onlyEnd = map.toCanonical(pos, 1) === decoration.to && end === decoration.to;
    if (node.type === first.node.type && onlyEnd) parts.push(part(pos));
    else done = true;
    return false;
  });
  return parts.length > 1 ? parts : [];
}

function onProjection(set: DecorationSet, map: ProjectionMap): DecorationSet {
  const cached = mapped.get(set);
  if (cached?.map === map) return cached.set;
  let moved = set.map(map.toProjectionMapping(), map.projection);
  // Only a node decoration the mapping dropped is looked for on the parts of a split block.
  const dropped = nodeDecorations(moved) < nodeDecorations(set);
  const split = dropped ? set.find().flatMap((decoration) => splitParts(decoration, map)) : [];
  // A leaf block maps onto its first part alone, so each leaf's decoration is looked for on the
  // parts after it, and drawn on every part.
  for (const decoration of set.find()) {
    if (!isNodeDecoration(decoration) || decoration.to - decoration.from !== 1) continue;
    const parts = leafParts(decoration, map);
    if (!parts.length) continue;
    const at = parts[0]?.from;
    moved = moved.remove(
      moved.find(at, at).filter((each) => each.from === at && each.spec === decoration.spec),
    );
    split.push(...parts);
  }
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
          // The pages number their footnotes for themselves.
          if (plugin.spec.key === footnoteNumbersKey) continue;
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
