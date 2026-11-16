// Enter, Backspace and Delete beside blocks that are not text: a paragraph after a selected block,
// and an empty paragraph removed when no join takes it away.

import { createParagraphNear } from 'prosemirror-commands';
import type { ContentMatch, NodeType } from 'prosemirror-model';
import { type Command, NodeSelection, Selection, TextSelection } from 'prosemirror-state';

// The first text block a place takes, as ProseMirror's own Enter picks one.
function textblockAt(match: ContentMatch): NodeType | null {
  for (let index = 0; index < match.edgeCount; index += 1) {
    const { type } = match.edge(index);
    if (type.isTextblock && !type.hasRequiredAttrs()) return type;
  }
  return null;
}

/**
 * Enter over a selected block, such as a figure or a page break, adds a paragraph after it with
 * the caret inside, wherever the block stands; at a gap cursor the paragraph goes at the gap.
 */
export const addParagraphNear: Command = (state, dispatch, view) => {
  const { selection } = state;
  if (!(selection instanceof NodeSelection) || selection.node.isInline)
    return createParagraphNear(state, dispatch, view);
  const { $to } = selection;
  const paragraph = textblockAt($to.parent.contentMatchAt($to.index()))?.createAndFill();
  if (!paragraph) return false;
  if (dispatch) {
    const tr = state.tr.insert($to.pos, paragraph);
    tr.setSelection(TextSelection.create(tr.doc, $to.pos + 1));
    dispatch(tr.scrollIntoView());
  }
  return true;
};

/**
 * Backspace (-1) or Delete (1) in an empty paragraph with a block on the other side removes the
 * paragraph and puts the caret at that block's near edge. Backspace leaves an empty paragraph
 * with a block before it to the join, which ends the caret there; this takes the first block of
 * a section's content, which nothing joins.
 */
export const deleteEmptyParagraph =
  (side: -1 | 1): Command =>
  (state, dispatch) => {
    const { $from, empty } = state.selection;
    const block = $from.parent;
    if (!empty || block.type.name !== 'paragraph' || block.content.size > 0) return false;
    if ($from.depth === 0) return false;
    const parent = $from.node(-1);
    const index = $from.index(-1);
    if (side < 0 && index > 0) return false;
    if (index + 1 >= parent.childCount || !parent.canReplace(index, index + 1)) return false;
    if (dispatch) {
      const from = $from.before();
      const tr = state.tr.delete(from, $from.after());
      tr.setSelection(Selection.near(tr.doc.resolve(from), 1));
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
