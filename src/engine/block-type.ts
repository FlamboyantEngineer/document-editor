// Changing a text block's type keeps the block's identity: its identity attributes (its element
// id, its author, the parts it is split into and the host's own), so references, anchors and
// authorship stay with the content. Its look (level, custom style) is the new type's, as the type
// chosen says.

import { setBlockType } from 'prosemirror-commands';
import type { Attrs, NodeType } from 'prosemirror-model';
import type { Command, EditorState } from 'prosemirror-state';
import { pickIdentityAttrs } from '../model/schema/element-attributes.js';

// The text blocks a text style applies to.
const STYLED = new Set(['paragraph', 'heading']);

// The positions of the paragraphs and headings the selection covers.
function styledBlocks(state: EditorState): number[] {
  const blocks: number[] = [];
  for (const { $from, $to } of state.selection.ranges) {
    state.doc.nodesBetween($from.pos, $to.pos, (node, pos) => {
      if (!node.isTextblock) return true;
      if (STYLED.has(node.type.name)) blocks.push(pos);
      return false;
    });
  }
  return blocks;
}

/**
 * Makes the selected paragraphs and headings blocks of `type` with `attrs`, each keeping its
 * identity; a code block, a caption or any other text block in the selection keeps its type.
 */
export function setTextblockType(type: NodeType, attrs: Attrs = {}): Command {
  return (state, dispatch) => {
    if (!setBlockType(type, attrs)(state)) return false;
    const blocks = styledBlocks(state);
    if (blocks.length === 0) return false;
    if (dispatch) {
      const tr = state.tr;
      for (const pos of blocks) {
        const at = tr.mapping.map(pos) + 1;
        tr.setBlockType(at, at, type, (node) => ({
          ...pickIdentityAttrs(node.type, node.attrs),
          ...attrs,
        }));
      }
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}
