// The room and lines of a page's header or footer (DOCE-PAGINATION-11.10, 11.2): the engine lays
// the region out with the texts its template variables show, and writes down the line table of
// each of its text blocks on the way, which the pages draw them on.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { BlockPlace, RegionGeometry } from '../layout-engine/blocks/types.js';
import type { LinesRecorder } from './nested-lines.js';
import type { DrawnLines, RegionRoom } from './text-engine-types.js';

interface RegionSource {
  readonly geometry: {
    layoutRegion(node: ProseMirrorNode, place: Omit<BlockPlace, 'region'>): RegionGeometry;
  };
  readonly recorder: LinesRecorder;
  readonly widthOf: (scope: string | null) => number;
}

/** A region as the engine laid it out: its room, and its text blocks' lines. */
interface LaidRegion {
  readonly room: RegionRoom | null;
  readonly lines: ReadonlyMap<ProseMirrorNode, DrawnLines>;
}

const NONE: ReadonlyMap<ProseMirrorNode, DrawnLines> = new Map();

// A region's room as the pages read it; null when the engine cannot lay the region out.
function roomOf(result: RegionGeometry): RegionRoom | null {
  return result.ok ? { height: result.height, gap: result.gap, children: result.children } : null;
}

/** The laid regions, kept by node, scope and variable texts until forgotten. */
export function createRegionLines(source: RegionSource) {
  let kept = new WeakMap<ProseMirrorNode, { key: string; laid: LaidRegion }>();
  return {
    lay(
      node: ProseMirrorNode,
      scope: string | null,
      variables?: ReadonlyMap<string, string>,
    ): LaidRegion {
      const key = `${scope ?? ''}|${variables ? JSON.stringify([...variables]) : '-'}`;
      const found = kept.get(node);
      if (found?.key === key) return found.laid;
      const { geometry, recorder } = source;
      const place = { width: source.widthOf(scope), scope, ...(variables ? { variables } : {}) };
      recorder.lines = new Map();
      const result = geometry.layoutRegion(node, place);
      const laid = { room: roomOf(result), lines: result.ok ? recorder.lines : NONE };
      recorder.lines = null;
      if (!result.ok || !result.provisional) kept.set(node, { key, laid });
      return laid;
    },
    forget() {
      kept = new WeakMap();
    },
  };
}
