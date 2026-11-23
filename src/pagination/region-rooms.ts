// The rooms of the page regions the pages' text layout engine lays out (`measureRegion`): a
// header's, a footer's or a footnote area's height, gap and children, kept by node, section and
// the texts of the variables they show.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { createBlockLayout } from '../layout-engine/blocks/block-layout.js';
import type { RegionGeometry } from '../layout-engine/blocks/types.js';
import type { PagesTextEngine, RegionRoom } from './text-engine-types.js';

// A region's room as the pages read it; null when the engine cannot lay the region out.
function roomOf(result: RegionGeometry): RegionRoom | null {
  return result.ok ? { height: result.height, gap: result.gap, children: result.children } : null;
}

/** The rooms of page regions as the engine lays them out, kept until they are forgotten. */
export function regionRooms(
  geometry: ReturnType<typeof createBlockLayout>,
  widthOf: (scope: string | null) => number,
) {
  let kept = new WeakMap<ProseMirrorNode, { key: string; room: RegionRoom | null }>();
  return {
    forget() {
      kept = new WeakMap();
    },
    measure: (...[node, scope, variables]: Parameters<PagesTextEngine['measureRegion']>) => {
      const key = `${scope ?? ''}|${variables ? JSON.stringify([...variables]) : '-'}`;
      const own = kept.get(node);
      if (own?.key === key) return own.room;
      const place = { width: widthOf(scope), scope, ...(variables ? { variables } : {}) };
      const result = geometry.layoutRegion(node, place);
      const room = roomOf(result);
      if (!result.ok || !result.provisional) kept.set(node, { key, room });
      return room;
    },
  };
}
