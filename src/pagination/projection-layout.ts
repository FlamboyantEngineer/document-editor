// A layout of the paged projection: the layout's source state follows the canonical document, the
// pages are laid out from it by the layout engine, and the projection is stepped onto them, so its selection and the
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
import { followDocument, startedOver } from './layout-source.js';
import { createProjectionMap, type ProjectionMap } from './projection-map.js';
import { nearAfter, projectionSelection } from './selection-mirror.js';
import type { PagesTextEngine } from './text-engine-types.js';

/** The states a layout reads. */
interface LayoutSource {
  /** The projection's state, stepped onto the new pages. */
  readonly projection: EditorState;
  /** The state the pages were last laid out from (`followDocument`), moved onto `canonical`. */
  readonly source: EditorState;
  /** Whether the source's plugins start over first, as after a value a plugin shows changed. */
  readonly restart?: boolean | undefined;
  readonly canonical: EditorState;
  /** What the latest layout found, which this one starts from. */
  readonly memory?: LayoutMemory | undefined;
  /** Told of each section laid out, by how many of its blocks the engine laid out again. */
  readonly onSection?: ((section: SectionReport) => void) | undefined;
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

/**
 * A layout: the projection transaction onto the new pages, the map after it, the pages, and the
 * state they were laid out from.
 */
interface ProjectionLayout {
  readonly source: EditorState;
  readonly tr: Transaction;
  readonly map: ProjectionMap;
  /** How each page was laid out, in order. */
  readonly metrics: readonly PageMetric[];
}

/** The projection transaction onto the canonical document's pages, and the map after it. */
export function layOutProjection(
  { projection, source: from, restart, canonical, memory, onSection }: LayoutSource,
  options: ProjectionLayoutOptions,
): ProjectionLayout {
  const source = followDocument(restart ? startedOver(from) : from, canonical.doc);
  const metrics: PageMetric[] = [];
  const sections = layoutDocument(source, {
    pageHeight: options.pageHeight,
    rules: options.rules,
    footnoteNumbering: options.footnoteNumbering,
    memory,
    onPage: (page) => metrics.push(page),
    onSection,
    engine: options.engine,
  });
  const target = projectDocument(source.doc, sections, options);
  const tr = projection.tr;
  repaginate(tr, target, options.fragmentRules);
  const map = createProjectionMap(tr.doc, options.fragmentRules);
  tr.setSelection(
    projectionSelection(map, canonical.selection, nearAfter(projection.selection, tr)),
  );
  return { tr, map, metrics, source };
}
