// Text typed over a selection keeps the comment anchors the selection was in. A comment's mark is
// not inclusive, so the text typed in place of a whole anchor would otherwise carry none, and the
// thread would lose its anchor.

import type { Mark } from 'prosemirror-model';
import type { EditorState, Transaction } from 'prosemirror-state';
import type { EditorProps } from 'prosemirror-view';

// The comment marks on the text between two positions of one text block.
function commentMarksIn(state: EditorState, from: number, to: number): Mark[] {
  const type = state.schema.marks.comment_highlight;
  if (!type) return [];
  const found: Mark[] = [];
  state.doc.nodesBetween(from, to, (node) => {
    for (const mark of node.marks) {
      if (mark.type === type && !mark.isInSet(found)) found.push(mark);
    }
    return !node.isInline;
  });
  return found;
}

/**
 * The change that types `text` in place of the text between two positions keeping the comment
 * anchors that text was in, or null when the ordinary change keeps them already.
 */
function typeKeepingComments(
  state: EditorState,
  range: { readonly from: number; readonly to: number },
  text: string,
): Transaction | null {
  const { from, to } = range;
  if (from >= to || !text) return null;
  const $from = state.doc.resolve(from);
  const $to = state.doc.resolve(to);
  if (!$from.sameParent($to)) return null;
  const kept = state.storedMarks ?? $from.marksAcross($to) ?? [];
  const lost = commentMarksIn(state, from, to).filter((mark) => !mark.isInSet(kept));
  if (lost.length === 0) return null;
  const marks = lost.reduce((set, mark) => mark.addToSet(set), kept);
  return state.tr.setStoredMarks(marks).insertText(text, from, to);
}

type TextInput = Parameters<NonNullable<EditorProps['handleTextInput']>>;

/** Types text over a selection keeping its comment anchors; false leaves the typing to others. */
export function keepCommentsTyped([view, from, to, text]: TextInput): boolean {
  const typed = typeKeepingComments(view.state, { from, to }, text);
  if (typed) view.dispatch(typed);
  return Boolean(typed);
}
