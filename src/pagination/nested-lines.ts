// The lines of the text blocks inside a top-level container of a page, such as a table's cells'
// paragraphs: the engine lays the container out as it measures it, and writes down the line table
// of each text block its geometry lays out on the way (DOCE-PAGINATION-11.2).

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { BlockGeometry, BlockPlace } from '../layout-engine/blocks/types.js';
import type { DrawnLines } from './text-engine-types.js';

/**
 * Where block geometry's text blocks are written down while a container is laid out for the lines
 * its text blocks are drawn on; null at any other time.
 */
export interface LinesRecorder {
  lines: Map<ProseMirrorNode, DrawnLines> | null;
}

interface NestedSource {
  readonly geometry: { layoutBlock(node: ProseMirrorNode, place: BlockPlace): BlockGeometry };
  readonly recorder: LinesRecorder;
  readonly widthOf: (scope: string | null) => number;
}

interface NestedPlace {
  readonly scope: string | null;
  /** A footnote marker's number, which its width follows. */
  readonly footnoteOf: (marker: ProseMirrorNode) => string | undefined;
}

// The numbers of the footnote markers anywhere in a container, in order.
function markersKey(node: ProseMirrorNode, footnoteOf: NestedPlace['footnoteOf']): string {
  let key = '';
  node.descendants((child) => {
    if (child.type.name === 'footnote_reference') key += `,${footnoteOf(child) ?? ''}`;
  });
  return key;
}

/** The nested lines of containers, kept by node, scope and footnote numbers until forgotten. */
export function createNestedLines(source: NestedSource) {
  let kept = new WeakMap<
    ProseMirrorNode,
    { key: string; lines: ReadonlyMap<ProseMirrorNode, DrawnLines> }
  >();
  return {
    lines(
      container: ProseMirrorNode,
      place: NestedPlace,
    ): ReadonlyMap<ProseMirrorNode, DrawnLines> {
      const { scope } = place;
      const key = `${scope ?? ''}|${markersKey(container, place.footnoteOf)}`;
      const found = kept.get(container);
      if (found?.key === key) return found.lines;
      const { geometry, recorder } = source;
      recorder.lines = new Map();
      const result = geometry.layoutBlock(container, { width: source.widthOf(scope), scope });
      const lines: ReadonlyMap<ProseMirrorNode, DrawnLines> = result.ok
        ? recorder.lines
        : new Map();
      recorder.lines = null;
      if (!result.ok || !result.provisional) kept.set(container, { key, lines });
      return lines;
    },
    forget() {
      kept = new WeakMap();
    },
  };
}
