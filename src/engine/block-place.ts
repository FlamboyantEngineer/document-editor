// Where a command that adds a block puts it: after the top-level block of the body holding a
// position. Page headers, footers and footnote areas hold no new blocks, and a position in one has
// no such place, so a block is never added outside the pages.

import type { Node as ProseMirrorNode, ResolvedPos } from 'prosemirror-model';

const REGIONS: ReadonlySet<string> = new Set(['page_header', 'page_footer', 'page_footnotes']);

/** Whether a node holds the body's top-level blocks: a page's content, or an unpaged section. */
export const isBodyParent = (parent: ProseMirrorNode | null): boolean =>
  parent?.type.name === 'page_content' || parent?.type.name === 'page_section';

/** Whether a position is in a page header, footer or footnote area. */
export function isInPageRegion($pos: ResolvedPos): boolean {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if (REGIONS.has($pos.node(depth).type.name)) return true;
  }
  return false;
}

/**
 * The end of the top-level block of the body (or of a document without pages) holding a position;
 * null in a page region or outside any block.
 */
export function topLevelBlockEnd($pos: ResolvedPos): number | null {
  if (isInPageRegion($pos)) return null;
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if (isBodyParent($pos.node(depth - 1)) || depth === 1) return $pos.after(depth);
  }
  return null;
}
