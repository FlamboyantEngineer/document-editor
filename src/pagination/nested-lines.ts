// The lines of the text blocks inside a top-level container of a page, such as a table's cells'
// paragraphs: the engine lays the container out as it measures it, and writes down the line table
// of each text block its geometry lays out on the way (DOCE-PAGINATION-11.2).

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { BlockGeometry, BlockPlace } from '../layout-engine/blocks/types.js';
import { suggestionKey, type SuggestionMarkup } from '../layout-engine/hidden-suggestions.js';
import { blockInsertedKey, type InsertedTexts, NO_INSERTED } from './inserted-texts.js';
import type { DrawnLines, NestedDrawing } from './text-engine-types.js';

/**
 * Where block geometry's text blocks are written down while a container is laid out for the lines
 * its text blocks are drawn on; null at any other time.
 */
export interface LinesRecorder {
  lines: Map<ProseMirrorNode, DrawnLines> | null;
  /** The labels the container's captions show while it is laid out; the numbers' by default. */
  labelOf?: ((caption: ProseMirrorNode) => string | undefined) | null | undefined;
}

interface NestedSource {
  readonly geometry: { layoutBlock(node: ProseMirrorNode, place: BlockPlace): BlockGeometry };
  readonly recorder: LinesRecorder;
  readonly widthOf: (scope: string | null) => number;
  /** A footnote marker's or entry's number, which its width follows. */
  readonly footnoteOf: (part: ProseMirrorNode) => string | undefined;
  /** The markup the pages are laid out in, by which one holding a suggestion is kept too. */
  readonly markup?: (() => SuggestionMarkup) | undefined;
  /** A caption's label in the measured document, whose width the caption's lines follow. */
  readonly labelOf?: ((caption: ProseMirrorNode) => string | undefined) | undefined;
  /** What the template variables anywhere in a node show, as a key (`bodyVariablesKey`). */
  readonly variablesKey?: ((node: ProseMirrorNode) => string) | undefined;
  /** Sets the words the text blocks being laid out are laid out with. */
  readonly inserting?: ((words: InsertedTexts) => void) | undefined;
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

// The labels a container's captions show, in order, as a key.
function labelsKey(
  container: ProseMirrorNode,
  labelOf: (caption: ProseMirrorNode) => string | undefined,
): string {
  let key = '';
  container.descendants((child) => {
    const label = labelOf(child);
    if (label !== undefined) key += `,${label}`;
    return !child.isTextblock;
  });
  return key;
}

/**
 * The nested lines of containers, kept by node, scope, footnote numbers, caption labels and markup
 * until forgotten.
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
      { labelOf, inserted = NO_INSERTED }: NestedDrawing = {},
    ): ReadonlyMap<ProseMirrorNode, DrawnLines> {
      const labels = labelOf ?? source.labelOf;
      const shown = labels ? labelsKey(container, labels) : '';
      const words = blockInsertedKey(container, inserted);
      const key = `${scope ?? ''}|${footnoteNumbersKey(container, source.footnoteOf)}|${suggestionKey(container, source.markup)}${source.variablesKey?.(container) ?? ''}|${shown}|${words}`;
      const found = kept.get(container);
      if (found?.key === key) return found.lines;
      const { geometry, recorder } = source;
      const recorded = new Map<ProseMirrorNode, DrawnLines>();
      recorder.lines = recorded;
      recorder.labelOf = labelOf ?? null;
      source.inserting?.(inserted);
      let result: BlockGeometry;
      // A layout that throws, as a host rule can, leaves no recorder writing for the next block.
      try {
        result = geometry.layoutBlock(container, { width: source.widthOf(scope), scope });
      } finally {
        source.inserting?.(NO_INSERTED);
        recorder.labelOf = null;
        recorder.lines = null;
      }
      const lines: ReadonlyMap<ProseMirrorNode, DrawnLines> = result.ok ? recorded : new Map();
      kept.set(container, { key, lines });
      return lines;
    },
    forget() {
      kept = new WeakMap();
    },
  };
}
