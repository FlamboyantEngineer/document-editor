// A layout of the paged projection: the ghost follows the canonical document and measures it, the
// pages are laid out from it, and the projection is stepped onto them, so its selection and the
// positions of its text map through. The map between the two documents is built again from the
// page transform, and the selection is the canonical one, on the side of a page break nearest the
// projection's.

import type { EditorState, Transaction } from 'prosemirror-state';
import { type FragmentRules, projectDocument, repaginate } from '../model/index.js';
import { followDocument, type MeasuringView } from './ghost-view.js';
import {
  layoutDocument,
  type LayoutMemory,
  type PageMetric,
  type SectionLayoutRules,
  type SectionPageHeight,
  type SectionReport,
} from './layout-document.js';
import type { MeasureCache } from './measure-blocks.js';
import { createProjectionMap, type ProjectionMap } from './projection-map.js';
import { projectionSelection } from './selection-mirror.js';

/** The views and state a layout reads. */
export interface LayoutSource {
  /** The projection's state, stepped onto the new pages. */
  readonly projection: EditorState;
  readonly ghost: MeasuringView;
  readonly canonical: EditorState;
  readonly cache: MeasureCache;
  /** What the latest layout found, which this one starts from. */
  readonly memory?: LayoutMemory | undefined;
  /** Told of each section laid out, by how many of its blocks were measured again. */
  readonly onSection?: ((section: SectionReport) => void) | undefined;
}

/** How the pages are laid out. */
export interface ProjectionLayoutOptions {
  readonly pageHeight: SectionPageHeight;
  readonly rules?: SectionLayoutRules | undefined;
  readonly footnoteNumbering?: 'document' | 'page' | undefined;
  readonly fragmentRules: FragmentRules;
}

/** A layout: the projection transaction onto the new pages, the map after it, and the pages. */
export interface ProjectionLayout {
  readonly tr: Transaction;
  readonly map: ProjectionMap;
  /** How each page was laid out, in order. */
  readonly metrics: readonly PageMetric[];
}

/** The projection transaction onto the canonical document's pages, and the map after it. */
export function layOutProjection(
  { projection, ghost, canonical, cache, memory, onSection }: LayoutSource,
  options: ProjectionLayoutOptions,
): ProjectionLayout {
  followDocument(ghost.view, canonical.doc, ghost.show);
  const metrics: PageMetric[] = [];
  const sections = layoutDocument(ghost.view, {
    pageHeight: options.pageHeight,
    rules: options.rules,
    footnoteNumbering: options.footnoteNumbering,
    cache,
    memory,
    onPage: (page) => metrics.push(page),
    onSection,
  });
  const target = projectDocument(ghost.view.state.doc, sections, options);
  const tr = projection.tr;
  repaginate(tr, target, options.fragmentRules);
  const map = createProjectionMap(tr.doc, options.fragmentRules);
  const near = projection.selection.map(tr.doc, tr.mapping);
  tr.setSelection(projectionSelection(map, canonical.selection, near));
  return { tr, map, metrics };
}
