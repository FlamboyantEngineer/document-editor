// Commands on a whole block, as the editor's context menu offers them on an object such as a table,
// a figure or a code block: the object it is about, an empty paragraph added before or after it,
// and the object deleted.

import { type Command, NodeSelection, type Selection, TextSelection } from 'prosemirror-state';

/** The block types a reader acts on as one object rather than as text. */
export const OBJECT_BLOCK_TYPES: ReadonlySet<string> = new Set([
  'table',
  'figure',
  'code_block',
  'linked_code_block',
  'math_display',
  'toc_block',
  'signature',
  'horizontal_rule',
]);

/**
 * The position before the object block a selection selects, or else the outermost object block
 * holding its start; null when it is in no object.
 */
export function objectBlockAt(selection: Selection): number | null {
  if (selection instanceof NodeSelection && OBJECT_BLOCK_TYPES.has(selection.node.type.name)) {
    return selection.from;
  }
  const { $from } = selection;
  for (let depth = 1; depth <= $from.depth; depth += 1) {
    if (OBJECT_BLOCK_TYPES.has($from.node(depth).type.name)) return $from.before(depth);
  }
  return null;
}

/** Adds an empty paragraph before or after the object holding the selection, with the caret in it. */
export function insertParagraphBesideObject(side: 'before' | 'after'): Command {
  return (state, dispatch) => {
    const pos = objectBlockAt(state.selection);
    const node = pos === null ? null : state.doc.nodeAt(pos);
    const paragraph = state.schema.nodes.paragraph;
    if (pos === null || !node || !paragraph) return false;
    const at = side === 'before' ? pos : pos + node.nodeSize;
    const $at = state.doc.resolve(at);
    if (!$at.parent.canReplaceWith($at.index(), $at.index(), paragraph)) return false;
    if (dispatch) {
      const tr = state.tr.insert(at, paragraph.create());
      dispatch(tr.setSelection(TextSelection.create(tr.doc, at + 1)).scrollIntoView());
    }
    return true;
  };
}

/**
 * Deletes the object holding the selection, as deleting it when selected does; the only block of
 * its parent leaves an empty paragraph with the caret in it.
 */
export const deleteObject: Command = (state, dispatch) => {
  const pos = objectBlockAt(state.selection);
  const node = pos === null ? null : state.doc.nodeAt(pos);
  if (pos === null || !node) return false;
  if (dispatch) {
    const { paragraph } = state.schema.nodes;
    const tr = state.tr;
    if (state.doc.resolve(pos).parent.childCount === 1 && paragraph) {
      tr.replaceWith(pos, pos + node.nodeSize, paragraph.create());
      tr.setSelection(TextSelection.create(tr.doc, pos + 1));
    } else {
      tr.setSelection(NodeSelection.create(state.doc, pos)).deleteSelection();
    }
    dispatch(tr.scrollIntoView());
  }
  return true;
};
