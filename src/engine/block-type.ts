// Changing a text block's type keeps the block's identity: its element id, its author and the
// parts it is split into, so references, anchors and authorship stay with the content. Its look
// (level, custom style) is the new type's, as the type chosen says.

import { setBlockType } from 'prosemirror-commands';
import type { Attrs, NodeType } from 'prosemirror-model';
import type { Command } from 'prosemirror-state';

// The element attributes that say which element a block is, not how it looks.
const IDENTITY_ATTRS = [
  'dataId',
  'dataAuthor',
  'dataAiSession',
  'splitPartIndex',
  'suggestionSplitKind',
  'suggestionSplitId',
] as const;

const identityOf = (attrs: Attrs): Attrs =>
  Object.fromEntries(
    IDENTITY_ATTRS.filter((name) => name in attrs).map((name) => [name, attrs[name]]),
  );

/** Makes the selected text blocks blocks of `type` with `attrs`, each keeping its identity. */
export function setTextblockType(type: NodeType, attrs: Attrs = {}): Command {
  return (state, dispatch) => {
    if (!setBlockType(type, attrs)(state)) return false;
    if (dispatch) {
      const tr = state.tr;
      for (const { $from, $to } of state.selection.ranges) {
        tr.setBlockType($from.pos, $to.pos, type, (node) => ({
          ...identityOf(node.attrs),
          ...attrs,
        }));
      }
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}
