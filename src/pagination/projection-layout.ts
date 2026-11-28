// A layout of the paged projection: the pages are laid out by the layout engine from a state that
// holds the canonical document, and the projection is stepped onto them, so its selection and the
// positions of its text map through. The map between the two documents is built again from the
// page transform, and the selection is the canonical one, on the side of a page break nearest the
// projection's.

import type { EditorState, Transaction } from 'prosemirror-state';
import { type FragmentRules, projectDocument, repaginate } from '../model/index.js';
import {
  layoutDocument,
  type LayoutMemory,
  type PageMetric,
  type SectionLayoutRules,
  type SectionPageHeight,
  type SectionReport,
} from './layout-document.js';
import { createProjectionMap, type ProjectionMap } from './projection-map.js';
import { nearAfter, projectionSelection } from './selection-mirror.js';
import type { PagesTextEngine } from './text-engine-types.js';

/** The states a layout reads. */
interface LayoutSource {
  /** The projection's state, stepped onto the new pages. */
  readonly projection: EditorState;
  /** The state the pages are laid out from, holding the canonical document (`followDocument`). */
  readonly source: EditorState;
  readonly canonical: EditorState;
  /** What the latest layout found, which this one starts from. */
  readonly memory?: LayoutMemory | undefined;
  /** Told of each section laid out, by how many of its blocks the engine laid out again. */
  readonly onSection?: ((section: SectionReport) => void) | undefined;
  /** Told when the layout stops with page numbers that still move (`onUnsettled`). */
  readonly onUnsettled?: ((reason: string) => void) | undefined;
}

/** How the pages are laid out. */
interface ProjectionLayoutOptions {
  readonly pageHeight: SectionPageHeight;
  readonly rules?: SectionLayoutRules | undefined;
  readonly footnoteNumbering?: 'document' | 'page' | undefined;
  readonly fragmentRules: FragmentRules;
  /** Lays every block out, with no DOM. */
  readonly engine: PagesTextEngine;
}

/** A layout: the projection transaction onto the new pages, the map after it, and the pages. */
interface ProjectionLayout {
  readonly tr: Transaction;
  readonly map: ProjectionMap;
  /** How each page was laid out, in order. */
  readonly metrics: readonly PageMetric[];
  /** The height the engine gave each top-level block, whole, by section. */
  readonly heights: readonly (readonly number[])[];
}

/** The projection transaction onto the canonical document's pages, and the map after it. */
export function layOutProjection(
  { projection, source, canonical, memory, onSection, onUnsettled }: LayoutSource,
  options: ProjectionLayoutOptions,
): ProjectionLayout {
  const metrics: PageMetric[] = [];
  const heights: (readonly number[])[] = [];
  const sections = layoutDocument(source, {
    pageHeight: options.pageHeight,
    rules: options.rules,
    footnoteNumbering: options.footnoteNumbering,
    memory,
    onPage: (page) => metrics.push(page),
    onSection: (section) => {
      heights.push(section.heights);
      onSection?.(section);
    },
    onUnsettled,
    engine: options.engine,
  });
  const hidden = options.engine.hiddenSuggestion?.() ?? null;
  const target = projectDocument(source.doc, sections, { ...options, hidden });
  const tr = projection.tr;
  repaginate(tr, target, options.fragmentRules);
  const map = createProjectionMap(tr.doc, options.fragmentRules);
  tr.setSelection(
    projectionSelection(map, canonical.selection, nearAfter(projection.selection, tr)),
  );
  return { tr, map, metrics, heights };
}
