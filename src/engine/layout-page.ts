// The page of the layout that holds a position of the state's document. A state holding the paged
// document is its own projection, so its positions find their page directly; a canonical state's
// positions go through the layout's map.

import type { EditorState } from 'prosemirror-state';
import { type LaidOutPage, pageMap } from '../pagination/page-map.js';

/** The page holding a position of the state's document, or null when no page does. */
export function layoutPageAt(state: EditorState, pos: number): LaidOutPage | null {
  const map = pageMap(state);
  if (map.projection !== state.doc) return map.pageAt(pos);
  return map.pages().find((page) => pos >= page.pos && pos < page.pos + page.node.nodeSize) ?? null;
}
