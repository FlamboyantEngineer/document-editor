// A split at the start of a text block, as Enter there makes, leaves the content where it was and
// an empty block before it: the empty block is the new element, so the content keeps its id, its
// author and the rest of its identity, and references and anchors to it stay with it.

import type { Node as ProseMirrorNode, ResolvedPos } from 'prosemirror-model';
import type { Command, Transaction } from 'prosemirror-state';
import { clearIdentityAttrs } from '../model/schema/element-attributes.js';

const isSplitPart = (node: ProseMirrorNode) =>
  node.attrs.splitPartIndex !== null && node.attrs.splitPartIndex !== undefined;

// The ids of the elements holding a position at the start of its text block, outermost first, with
// the depth of the outermost; none when one of them is a part of an element the pagination split.
function idsAtStart($pos: ResolvedPos): { ids: Set<string>; depth: number } | null {
  if ($pos.parentOffset !== 0 || $pos.parent.content.size === 0) return null;
  const ids = new Set<string>();
  let depth = 0;
  for (let at = $pos.depth; at > 0; at -= 1) {
    const node = $pos.node(at);
    if (isSplitPart(node)) return null;
    if (typeof node.attrs.dataId !== 'string') continue;
    ids.add(node.attrs.dataId);
    depth = at;
  }
  return depth ? { ids, depth } : null;
}

// Gives the blocks before the caret that copied the ids of the blocks holding it a copy's
// attributes, so the element ids make them new elements.
function moveIdentityToContent(tr: Transaction, from: number, ids: Set<string>): Transaction {
  const caret = tr.selection.from;
  tr.doc.nodesBetween(from, caret, (node, pos) => {
    const holdsCaret = pos < caret && pos + node.nodeSize > caret;
    const id: unknown = node.attrs.dataId;
    if (!holdsCaret && typeof id === 'string' && ids.has(id)) {
      tr.setNodeMarkup(pos, null, clearIdentityAttrs(node.type, node.attrs));
    }
    return !node.isTextblock;
  });
  return tr;
}

/**
 * Runs a command that splits blocks, such as Enter's, so that a split at the start of a text block
 * keeps the elements' identity with the content and makes the empty blocks before it new.
 */
export function keepIdentityWithContent(split: Command): Command {
  return (state, dispatch, view) => {
    const { $from, empty } = state.selection;
    const start = empty ? idsAtStart($from) : null;
    if (!start || !dispatch) return split(state, dispatch, view);
    return split(
      state,
      (tr) => {
        const from = tr.mapping.map($from.before(start.depth), -1);
        dispatch(moveIdentityToContent(tr, from, start.ids));
      },
      view,
    );
  };
}
