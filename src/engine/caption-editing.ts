// A table's, a figure's or a code block's caption is document content, edited as text in place: the caret goes
// into it as into any text, and what the writer types is in the document as they type it. Select
// All in a caption selects its text, and a press on a figure's image selects the figure; the
// document keys add no line in a caption, which is one line (`document-editing.ts`).

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import {
  type Command,
  type EditorState,
  NodeSelection,
  TextSelection,
  type Transaction,
} from 'prosemirror-state';
import type { EditorProps } from 'prosemirror-view';

type ClickOn = Parameters<NonNullable<EditorProps['handleClickOn']>>;
import { isCaptionNode } from '../model/schema/caption-content.js';
import { captionedAt, captionNodeAt } from './captions.js';

/** The caption holding the selection, with its position, or null. */
function captionAtSelection(state: EditorState): { pos: number; node: ProseMirrorNode } | null {
  const { $from, $to } = state.selection;
  if (!$from.sameParent($to) || !isCaptionNode($from.parent)) return null;
  return { pos: $from.before(), node: $from.parent };
}

// Selects a caption's text.
const selectCaptionText =
  (caption: { pos: number; node: ProseMirrorNode }): Command =>
  (state, dispatch) => {
    const from = caption.pos + 1;
    dispatch?.(
      state.tr
        .setSelection(TextSelection.create(state.doc, from, from + caption.node.content.size))
        .scrollIntoView(),
    );
    return true;
  };

/**
 * Selects the text of the caption of the table, figure or code block at the selection, and shows
 * it, so the writer edits it in place.
 */
export const editCaptionText: Command = (state, dispatch, view) => {
  const found = captionedAt(state);
  const caption = found ? captionNodeAt(state.doc, found) : null;
  if (!found || !caption) return false;
  if (dispatch && found.node.attrs.captionEnabled === false) {
    const tr = state.tr.setNodeMarkup(found.pos, undefined, {
      ...found.node.attrs,
      captionEnabled: true,
    });
    const from = caption.pos + 1;
    tr.setSelection(TextSelection.create(tr.doc, from, from + caption.node.content.size));
    dispatch(tr.scrollIntoView());
  } else selectCaptionText(caption)(state, dispatch);
  // Only running it takes the focus; asking whether it can run, as a menu does, leaves it.
  if (dispatch) view?.focus();
  return true;
};

/** Select All in a caption selects its text, or everything once its text is selected. */
export const selectAllInCaption: Command = (state, dispatch) => {
  const caption = captionAtSelection(state);
  if (!caption) return false;
  const from = caption.pos + 1;
  const { selection } = state;
  if (selection.from === from && selection.to === from + caption.node.content.size) return false;
  return selectCaptionText(caption)(state, dispatch);
};

/** A press on a figure's image selects the figure, which its caption's text would otherwise take. */
export function selectFigureOnImage(...[view, , node, nodePos, event]: ClickOn): boolean {
  const target = event.target as Element | null;
  if (node.type.name !== 'figure' || target?.nodeName !== 'IMG') return false;
  view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, nodePos)));
  return true;
}

/**
 * Keeps the node selected after a change to its attributes, which would otherwise put the
 * selection in the content of a node that has some, such as a figure's caption.
 */
export function keepNodeSelected(tr: Transaction, before: EditorState): Transaction {
  const { selection } = before;
  if (!(selection instanceof NodeSelection)) return tr;
  const pos = tr.mapping.map(selection.from);
  const node = tr.doc.nodeAt(pos);
  return node && NodeSelection.isSelectable(node)
    ? tr.setSelection(NodeSelection.create(tr.doc, pos))
    : tr;
}
