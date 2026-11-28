// Where the engine laid out a figure or a table of the pages (DOCE-PAGINATION-10.12): the sizes a
// resize starts from and stores, read from the layout rather than from the drawn element, so the
// stored numbers are the same whoever resizes, at whatever zoom or device pixel ratio.

import type { EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { ObjectBox } from '../layout-engine/blocks/types.js';
import { regionAt } from '../model/schema/document-structure.js';
import { sectionContentWidth } from './content-width.js';
import { forcedLinesKey, sectionScope } from './forced-lines.js';
import { insertedTexts } from './inserted-texts.js';

/**
 * The box the engine laid out the figure or table at a position of the pages in; null when the
 * pages are not laid out by the engine (the web layout), or the engine cannot lay its block out.
 */
export function objectBoxAt(state: EditorState, pos: number): ObjectBox | null {
  const engine = forcedLinesKey.getState(state)?.engine;
  const node = state.doc.nodeAt(pos);
  if (!engine || !node || node.isLeaf) return null;
  const $inside = state.doc.resolve(pos + 1);
  const region = regionAt($inside);
  if (region?.kind !== 'content' || $inside.depth <= region.depth) return null;
  const block = $inside.node(region.depth + 1);
  const inserted = node.type.name === 'table' ? insertedTexts(state, [forcedLinesKey]) : undefined;
  return engine.objectBoxes(block, sectionScope(region.section.node), inserted).get(node) ?? null;
}

/**
 * The width of the page content of the section a position is in, which no figure there may be
 * wider than; null when the pages are not laid out by the engine.
 */
export function contentRoomAt(state: EditorState, pos: number): number | null {
  const engine = forcedLinesKey.getState(state)?.engine;
  if (!engine) return null;
  const $pos = state.doc.resolve(Math.min(Math.max(0, pos), state.doc.content.size));
  const region = regionAt($pos);
  return sectionContentWidth(engine.template, region ? sectionScope(region.section.node) : null);
}

/** The pages a view stands in for, as the projection's view does for the canonical state. */
interface ViewPages {
  /** The pages' state, which the engine laid out. */
  state(): EditorState;
  /** A position of the view's state on the pages; null when it is not on them. */
  toPages(pos: number): number | null;
}

const boundPages = new WeakMap<EditorView, ViewPages>();

/** Associates a view with the pages it stands in for, for as long as it does. */
export function bindViewPages(view: EditorView, pages: ViewPages): () => void {
  boundPages.set(view, pages);
  return () => {
    if (boundPages.get(view) === pages) boundPages.delete(view);
  };
}

// A position of the state a view shows on the pages: through the pages it stands in for, else its
// own state's, which is the pages' when the view renders them.
function onPages(view: EditorView, pos: number): { state: EditorState; pos: number } | null {
  const pages = boundPages.get(view);
  if (!pages) return { state: view.state, pos };
  const at = pages.toPages(pos);
  return at === null ? null : { state: pages.state(), pos: at };
}

/** The engine's box of the figure or table at a position of the state a view shows. */
export function objectBoxOf(view: EditorView, pos: number): ObjectBox | null {
  const at = onPages(view, pos);
  return at ? objectBoxAt(at.state, at.pos) : null;
}

/**
 * The height the row of the cell at a position of the state a view shows is laid out at, in the
 * part of its table the cell is drawn in, and what its cells take beyond the height a row sets:
 * their padding and the halves of their borders, above and below.
 */
export function rowBoxOf(
  view: EditorView,
  cellPos: number,
): { height: number; edges: number } | null {
  const at = onPages(view, cellPos);
  if (!at) return null;
  const $cell = at.state.doc.resolve(at.pos);
  if ($cell.depth < 2 || $cell.node(-1).type.spec.tableRole !== 'table') return null;
  const box = objectBoxAt(at.state, $cell.before(-1));
  if (box?.kind !== 'table') return null;
  const height = box.rows[$cell.index(-1)];
  return height === undefined ? null : { height, edges: 2 * box.edge };
}

/** The content width of the section a position of the state a view shows is in. */
export function contentRoomOf(view: EditorView, pos: number): number | null {
  const at = onPages(view, pos);
  return at ? contentRoomAt(at.state, at.pos) : null;
}
