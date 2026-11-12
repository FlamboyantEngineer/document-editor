// The canonical state's decorations, drawn on the pages. Plugins that decorate (search, proofing,
// comments, changes) run on the canonical state, where every edit is made; the projection draws
// what they draw, mapped onto its pages. A decoration on content the page transform drops, such
// as a repeated header row's copy, is not drawn there.

import { type EditorState, Plugin } from 'prosemirror-state';
import { DecorationSet } from 'prosemirror-view';
import type { ProjectionMap } from './projection-map.js';

/** What the drawn decorations read: the canonical state and the map onto the projection. */
export interface DecorationSource {
  canonical(): EditorState;
  map(): ProjectionMap;
}

// Each canonical set as mapped onto one projection map, so an unchanged set maps once.
const mapped = new WeakMap<DecorationSet, { map: ProjectionMap; set: DecorationSet }>();

function onProjection(set: DecorationSet, map: ProjectionMap): DecorationSet {
  const cached = mapped.get(set);
  if (cached?.map === map) return cached.set;
  const projected = set.map(map.toProjectionMapping(), map.projection);
  mapped.set(set, { map, set: projected });
  return projected;
}

/** A projection plugin that draws every decoration the canonical state's plugins draw. */
export function canonicalDecorations(source: DecorationSource): Plugin {
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
        const all = sets.flatMap((set) => set.find());
        return DecorationSet.create(state.doc, all);
      },
    },
  });
}
