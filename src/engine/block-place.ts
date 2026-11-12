// Where a command that adds a block puts it: after the top-level block of the body holding a
// position. Page headers, footers and footnote areas hold no new blocks, and neither does a page
// itself between its regions, so a position outside a page's content has no such place, and a
// block is never added outside the pages' content.

import type { Node as ProseMirrorNode, ResolvedPos } from 'prosemirror-model';
import type { EditorState } from 'prosemirror-state';
import { isSectionNode, isStructureNode, regionAt, regionKind } from '../model/index.js';

// Whether a node holds pages or regions rather than blocks.
const holdsStructure = (node: ProseMirrorNode) =>
  node.firstChild !== null && isStructureNode(node.firstChild);

/** Whether a node holds the body's top-level blocks: a page's content, or an unpaged section. */
export const isBodyParent = (parent: ProseMirrorNode | null): boolean =>
  parent !== null &&
  (regionKind(parent) === 'content' || (isSectionNode(parent) && !holdsStructure(parent)));

/** Whether a position is in a page header, footer or footnote area. */
export function isInPageRegion($pos: ResolvedPos): boolean {
  const kind = regionAt($pos)?.kind;
  return kind !== undefined && kind !== 'content';
}

// The end of a top-level block of the body, or null when the node there is a page or a region.
const blockEnd = (node: ProseMirrorNode | null | undefined, end: number) =>
  node && isStructureNode(node) ? null : end;

/**
 * The end of the top-level block of the body (or of a document without pages) holding a position;
 * null in a page region, between a page's regions or outside any block.
 */
export function topLevelBlockEnd($pos: ResolvedPos): number | null {
  if (isInPageRegion($pos) || holdsStructure($pos.parent)) return null;
  // Between top-level blocks, as a selected object's start is: the end of the block after it.
  if ($pos.depth > 0 && isBodyParent($pos.parent))
    return blockEnd($pos.nodeAfter, $pos.pos + ($pos.nodeAfter?.nodeSize ?? 0));
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if (isBodyParent($pos.node(depth - 1)) || depth === 1)
      return blockEnd($pos.node(depth), $pos.after(depth));
  }
  return null;
}

/**
 * Where a new block goes: in place of the empty paragraph holding the caret, or after the
 * top-level block of the body holding it; null outside a page's content, such as in a page
 * header, footer or footnote area.
 */
export function newBlockRange(state: EditorState): { from: number; to: number } | null {
  const { $from } = state.selection;
  if (isInPageRegion($from)) return null;
  const parent = $from.parent;
  if (parent.type.name === 'paragraph' && parent.childCount === 0) {
    return { from: $from.before(), to: $from.after() };
  }
  const end = topLevelBlockEnd($from);
  return end === null ? null : { from: end, to: end };
}

/** Whether a block can be added where the selection is, as the block commands add one. */
export const canInsertBlock = (state: EditorState): boolean => newBlockRange(state) !== null;
