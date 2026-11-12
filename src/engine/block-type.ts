// Changing a text block's type keeps the block's identity: its identity attributes (its element
// id, its author, the parts it is split into and the host's own), so references, anchors and
// authorship stay with the content. Its look (level, custom style) is the new type's, as the type
// chosen says.

import { setBlockType } from 'prosemirror-commands';
import type { Attrs, NodeType } from 'prosemirror-model';
import type { Command } from 'prosemirror-state';
import { pickIdentityAttrs } from '../model/schema/element-attributes.js';

/** Makes the selected text blocks blocks of `type` with `attrs`, each keeping its identity. */
export function setTextblockType(type: NodeType, attrs: Attrs = {}): Command {
  return (state, dispatch) => {
    if (!setBlockType(type, attrs)(state)) return false;
    if (dispatch) {
      const tr = state.tr;
      for (const { $from, $to } of state.selection.ranges) {
        tr.setBlockType($from.pos, $to.pos, type, (node) => ({
          ...pickIdentityAttrs(node.type, node.attrs),
          ...attrs,
        }));
      }
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}
