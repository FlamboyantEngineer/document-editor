// The rooms the text layout engine lays page headers, footers and footnote areas out in, kept by
// node and by the scope and variable texts each was laid out with: a header showing the page's
// number keeps a room for each number it showed (DOCE-PAGINATION-11.10).

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { BlockPlace, RegionGeometry } from '../layout-engine/blocks/types.js';
import type { RegionRoom } from './text-engine-types.js';

// A region's room as the pages read it; null when the engine cannot lay the region out.
function roomOf(result: RegionGeometry): RegionRoom | null {
  return result.ok ? { height: result.height, gap: result.gap, children: result.children } : null;
}

/** Regions' rooms, laid out once for each scope and set of variable texts. */
export function createRegionRooms(
  layoutRegion: (node: ProseMirrorNode, place: Omit<BlockPlace, 'region'>) => RegionGeometry,
  widthOf: (scope: string | null) => number,
) {
  let kept = new WeakMap<ProseMirrorNode, Map<string, RegionRoom | null>>();
  return {
    measure(
      node: ProseMirrorNode,
      scope: string | null,
      variables?: ReadonlyMap<string, string>,
    ): RegionRoom | null {
      const key = `${scope ?? ''}|${variables ? JSON.stringify([...variables]) : '-'}`;
      const rooms = kept.get(node);
      const known = rooms?.get(key);
      if (known !== undefined) return known;
      const place = { width: widthOf(scope), scope, ...(variables ? { variables } : {}) };
      const result = layoutRegion(node, place);
      const room = roomOf(result);
      if (!result.ok || !result.provisional) kept.set(node, (rooms ?? new Map()).set(key, room));
      return room;
    },
    /** Forgets every room, as after atoms settle. */
    forget(): void {
      kept = new WeakMap();
    },
  };
}
