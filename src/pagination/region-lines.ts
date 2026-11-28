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
 * The fewest laid regions kept for one node, the least recently used dropped first: a footer
 * showing `Page X of Y` is laid out for each page under each page count, and a long session tries
 * many counts. A 300-page document takes about 900 across its page-count passes.
 */
export const REGIONS_KEPT_PER_NODE = 1024;

/**
 * The laid regions kept for one node for each page of the longest document it showed the page
 * count of: one per page under each of the counts a layout's passes try, so a document of any
 * length keeps every region its last layout drew.
 */
export const REGIONS_KEPT_PER_PAGE = 3;

// The page count a region shows, from its variables; 0 when it shows none.
const shownPages = (variables: ReadonlyMap<string, string> | undefined) =>
  Number.parseInt(variables?.get('page.total') ?? '', 10) || 0;

// A region's room as the pages read it; null when the engine cannot lay the region out.
function roomOf(result: RegionGeometry): RegionRoom | null {
  return result.ok ? { height: result.height, gap: result.gap, children: result.children } : null;
}

/**
 * The laid regions, kept by node, scope, variable texts, footnote numbers and markup until forgotten: a header showing the
 * page's number keeps a region for each number it showed, up to `REGIONS_KEPT_PER_NODE` or
 * `REGIONS_KEPT_PER_PAGE` for each page of the longest document it showed the count of.
 */
export function createRegionLines(source: RegionSource) {
  let kept = new WeakMap<ProseMirrorNode, Map<string, LaidRegion>>();
  let pages = 0;
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
      pages = Math.max(pages, shownPages(variables));
      if (regions.size >= Math.max(REGIONS_KEPT_PER_NODE, REGIONS_KEPT_PER_PAGE * pages))
        regions.delete(regions.keys().next().value ?? '');
      kept.set(node, regions.set(key, laid));
      return laid;
    },
    forget() {
      kept = new WeakMap();
    },
  };
}
