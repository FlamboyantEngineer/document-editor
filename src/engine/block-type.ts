// Changing a text block's type keeps the block: its element id, its author and every attribute the
// new type also has, so references, anchors and authorship stay with the content.

import { setBlockType } from 'prosemirror-commands';
import type { Attrs, NodeType } from 'prosemirror-model';
import type { Command } from 'prosemirror-state';

/**
 * Makes the selected text blocks blocks of `type`, with `attrs` over the attributes each block
 * already has that `type` also has.
 */
export function setTextblockType(type: NodeType, attrs: Attrs = {}): Command {
  return (state, dispatch) => {
    if (!setBlockType(type, attrs)(state)) return false;
    if (dispatch) {
      const tr = state.tr;
      for (const { $from, $to } of state.selection.ranges) {
        tr.setBlockType($from.pos, $to.pos, type, (node) => ({ ...node.attrs, ...attrs }));
      }
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}
