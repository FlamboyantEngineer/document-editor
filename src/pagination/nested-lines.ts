// The lines of the text blocks inside a top-level container of a page, such as a table's cells'
// paragraphs: the engine lays the container out as it measures it, and writes down the line table
// of each text block its geometry lays out on the way (DOCE-PAGINATION-11.2).

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { BlockGeometry, BlockPlace } from '../layout-engine/blocks/types.js';
import { suggestionKey, type SuggestionMarkup } from '../layout-engine/hidden-suggestions.js';
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
  /** A footnote marker's or entry's number, which its width follows. */
  readonly footnoteOf: (part: ProseMirrorNode) => string | undefined;
  /** The markup the pages are laid out in, by which one holding a suggestion is kept too. */
  readonly markup?: (() => SuggestionMarkup) | undefined;
  /** What the template variables anywhere in a node show, as a key (`bodyVariablesKey`). */
  readonly variablesKey?: ((node: ProseMirrorNode) => string) | undefined;
}

/**
 * The numbers of the footnote markers and entries anywhere in a node, in order, as a key: a
 * marker's or an entry's width follows its number.
 */
export function footnoteNumbersKey(
  node: ProseMirrorNode,
  footnoteOf: NestedSource['footnoteOf'],
): string {
  let key = '';
  node.descendants((child) => {
    const name = child.type.name;
    if (name === 'footnote_reference' || name === 'footnote_entry')
      key += `,${footnoteOf(child) ?? ''}`;
  });
  return key;
}

/**
 * The nested lines of containers, kept by node, scope, footnote numbers and markup until
 * forgotten.
 */
export function createNestedLines(source: NestedSource) {
  let kept = new WeakMap<
    ProseMirrorNode,
    { key: string; lines: ReadonlyMap<ProseMirrorNode, DrawnLines> }
  >();
  return {
    lines(
      container: ProseMirrorNode,
      scope: string | null,
    ): ReadonlyMap<ProseMirrorNode, DrawnLines> {
      const key = `${scope ?? ''}|${footnoteNumbersKey(container, source.footnoteOf)}|${suggestionKey(container, source.markup)}${source.variablesKey?.(container) ?? ''}`;
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
