// A layout of the paged projection: the ghost follows the canonical document and measures it, the
// pages are laid out from it, and the projection is stepped onto them, so its selection and the
// positions of its text map through. The map between the two documents is built again from the
// page transform, and the selection is the canonical one, on the side of a page break nearest the
// projection's.

import type { EditorState, Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import {
  type FragmentRules,
  type LayoutRules,
  projectDocument,
  repaginate,
} from '../model/index.js';
import { followDocument } from './ghost-view.js';
import { layoutDocument, type SectionPageHeight } from './layout-document.js';
import type { MeasureCache } from './measure-blocks.js';
import { createProjectionMap, type ProjectionMap } from './projection-map.js';
import { projectionSelection } from './selection-mirror.js';

/** The views and state a layout reads. */
export interface LayoutSource {
  /** The projection's state, stepped onto the new pages. */
  readonly projection: EditorState;
  readonly ghost: EditorView;
  readonly canonical: EditorState;
  readonly cache: MeasureCache;
}

/** How the pages are laid out. */
export interface ProjectionLayoutOptions {
  readonly pageHeight: SectionPageHeight;
  readonly rules?: LayoutRules | undefined;
  readonly footnoteNumbering?: 'document' | 'page' | undefined;
  readonly fragmentRules: FragmentRules;
}

/** The projection transaction onto the canonical document's pages, and the map after it. */
export function layOutProjection(
  { projection, ghost, canonical, cache }: LayoutSource,
  options: ProjectionLayoutOptions,
): { readonly tr: Transaction; readonly map: ProjectionMap } {
  followDocument(ghost, canonical.doc);
  const sections = layoutDocument(ghost, {
    pageHeight: options.pageHeight,
    rules: options.rules,
    footnoteNumbering: options.footnoteNumbering,
    cache,
  });
  const target = projectDocument(ghost.state.doc, sections, options);
  const tr = projection.tr;
  repaginate(tr, target, options.fragmentRules);
  const map = createProjectionMap(tr.doc, options.fragmentRules);
  const near = projection.selection.map(tr.doc, tr.mapping);
  tr.setSelection(projectionSelection(map, canonical.selection, near));
  return { tr, map };
}
