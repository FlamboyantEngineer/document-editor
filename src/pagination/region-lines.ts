// The room and lines of a page's header or footer (DOCE-PAGINATION-11.10, 11.2): the engine lays
// the region out with the texts its template variables show, and writes down the line table of
// each of its text blocks on the way, which the pages draw them on.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { BlockPlace, RegionGeometry } from '../layout-engine/blocks/types.js';
import { footnoteNumbersKey, type LinesRecorder } from './nested-lines.js';
import type { DrawnLines, RegionRoom } from './text-engine-types.js';

interface RegionSource {
  readonly geometry: {
    layoutRegion(node: ProseMirrorNode, place: Omit<BlockPlace, 'region'>): RegionGeometry;
  };
  readonly recorder: LinesRecorder;
  readonly widthOf: (scope: string | null) => number;
  /** A footnote entry's or marker's number, which its width follows. */
  readonly footnoteOf: (part: ProseMirrorNode) => string | undefined;
  /** What the region's layout depends on in the current markup. */
  readonly markupKey?: ((node: ProseMirrorNode) => string) | undefined;
}

/** A region as the engine laid it out: its room, and its text blocks' lines. */
interface LaidRegion {
  readonly room: RegionRoom | null;
  readonly lines: ReadonlyMap<ProseMirrorNode, DrawnLines>;
}

const NONE: ReadonlyMap<ProseMirrorNode, DrawnLines> = new Map();

/**
 * The most laid regions kept for one node, the least recently used dropped first: a footer showing
 * `Page X of Y` is laid out for each page under each page count, and a long session tries many
 * counts. A 300-page document takes about 900 across its page-count passes.
 */
export const REGIONS_KEPT_PER_NODE = 1024;

// A region's room as the pages read it; null when the engine cannot lay the region out.
function roomOf(result: RegionGeometry): RegionRoom | null {
  return result.ok ? { height: result.height, gap: result.gap, children: result.children } : null;
}

/**
 * The laid regions, kept by node, scope, variable texts, footnote numbers and markup until forgotten: a header showing the
 * page's number keeps a region for each number it showed, up to `REGIONS_KEPT_PER_NODE`.
 */
export function createRegionLines(source: RegionSource) {
  let kept = new WeakMap<ProseMirrorNode, Map<string, LaidRegion>>();
  return {
    lay(
      node: ProseMirrorNode,
      scope: string | null,
      variables?: ReadonlyMap<string, string>,
    ): LaidRegion {
      const markup = source.markupKey?.(node) ?? '';
      const numbers = footnoteNumbersKey(node, source.footnoteOf);
      const key = `${scope ?? ''}|${variables ? JSON.stringify([...variables]) : '-'}|${numbers}|${markup}`;
      const regions = kept.get(node) ?? new Map<string, LaidRegion>();
      const found = regions.get(key);
      if (found) {
        regions.delete(key);
        regions.set(key, found);
        return found;
      }
      const { geometry, recorder } = source;
      const place = { width: source.widthOf(scope), scope, ...(variables ? { variables } : {}) };
      const recorded = new Map<ProseMirrorNode, DrawnLines>();
      recorder.lines = recorded;
      let result: RegionGeometry;
      // A layout that throws, as a host rule can, leaves no recorder writing for the next block.
      try {
        result = geometry.layoutRegion(node, place);
      } finally {
        recorder.lines = null;
      }
      const laid = { room: roomOf(result), lines: result.ok ? recorded : NONE };
      if (regions.size >= REGIONS_KEPT_PER_NODE) regions.delete(regions.keys().next().value ?? '');
      kept.set(node, regions.set(key, laid));
      return laid;
    },
    forget() {
      kept = new WeakMap();
    },
  };
}
