// Comment anchors: the text a comment thread is about, marked with the thread's id
// (`comment_highlight`) and its state, so the anchor follows the text through edits and is stored
// with the document. The threads themselves live in the host's comment store.

import type { Mark, MarkType, Node as ProseMirrorNode } from 'prosemirror-model';
import type { Command, EditorState, Transaction } from 'prosemirror-state';

/** Whether a comment thread is open or resolved. */
export type CommentState = 'open' | 'resolved';

/** The text a comment thread is anchored to. */
export interface CommentAnchor {
  readonly thread: string;
  readonly state: CommentState;
  readonly from: number;
  readonly to: number;
  /** The anchored text, as the thread quotes it. */
  readonly text: string;
}

const anchorType = (schema: EditorState['schema']): MarkType | undefined =>
  schema.marks.comment_highlight;

/** The comment anchors of a document in reading order, one per thread, spanning all its text. */
export function listCommentAnchors(doc: ProseMirrorNode): CommentAnchor[] {
  const type = anchorType(doc.type.schema);
  const found = new Map<
    string,
    { thread: string; state: CommentState; from: number; to: number; text: string }
  >();
  doc.descendants((node, pos) => {
    if (!node.isInline) return true;
    const mark = type ? node.marks.find((each) => each.type === type) : undefined;
    const thread: unknown = mark?.attrs.commentId;
    if (!mark || typeof thread !== 'string') return false;
    const entry = found.get(thread) ?? {
      thread,
      state: mark.attrs.commentState === 'resolved' ? 'resolved' : 'open',
      from: pos,
      to: pos,
      text: '',
    };
    entry.to = pos + node.nodeSize;
    entry.text += node.text ?? '';
    found.set(thread, entry);
    return false;
  });
  return [...found.values()].sort((a, b) => a.from - b.from);
}

/** The selected text, as a new comment would quote it; empty without a selection. */
export function selectedText(state: EditorState): string {
  const { from, to, empty } = state.selection;
  return empty ? '' : state.doc.textBetween(from, to, ' ', ' ');
}

/**
 * Anchors a comment thread to a range of a transaction's document; returns whether it could, which
 * needs text in the range and comment anchors in the schema.
 */
export function anchorCommentRange(
  tr: Transaction,
  { from, to }: { readonly from: number; readonly to: number },
  thread: string,
): boolean {
  const type = anchorType(tr.doc.type.schema);
  if (!type || from >= to || !tr.doc.textBetween(from, to).trim()) return false;
  tr.addMark(from, to, type.create({ commentId: thread, commentState: 'open' }));
  return true;
}

/**
 * Anchors a comment thread to the selected text. Refused without a selection or text in it, or
 * when the schema has no comment anchors.
 */
export function addCommentAnchor(thread: string): Command {
  return (state, dispatch) => {
    const type = anchorType(state.schema);
    const { from, to, empty } = state.selection;
    if (!type || empty || !selectedText(state).trim()) return false;
    dispatch?.(
      state.tr.addMark(from, to, type.create({ commentId: thread, commentState: 'open' })),
    );
    return true;
  };
}

// Applies a change to every mark of a type whose attribute names an id; returns whether any did.
function eachMark(
  tr: Transaction,
  matches: (mark: Mark) => boolean,
  change: (range: readonly [number, number], mark: Mark) => void,
): boolean {
  let found = false;
  tr.doc.descendants((node, pos) => {
    if (!node.isInline) return true;
    for (const mark of node.marks) {
      if (!matches(mark)) continue;
      change([pos, pos + node.nodeSize], mark);
      found = true;
    }
    return false;
  });
  return found;
}

/** Marks a thread's anchor open or resolved; a stylesheet usually hides a resolved anchor. */
export function setCommentState(thread: string, next: CommentState): Command {
  return (state, dispatch) => {
    const type = anchorType(state.schema);
    const tr = state.tr;
    const found =
      type !== undefined &&
      eachMark(
        tr,
        (mark) => mark.type === type && mark.attrs.commentId === thread,
        ([from, to], mark) => {
          tr.removeMark(from, to, mark);
          tr.addMark(from, to, type.create({ ...mark.attrs, commentState: next }));
        },
      );
    if (found && tr.docChanged) dispatch?.(tr);
    return found;
  };
}

/** Removes a thread's anchor, leaving its text. */
export function removeCommentAnchor(thread: string): Command {
  return (state, dispatch) => {
    const type = anchorType(state.schema);
    const tr = state.tr;
    const found =
      type !== undefined &&
      eachMark(
        tr,
        (mark) => mark.type === type && mark.attrs.commentId === thread,
        ([from, to], mark) => tr.removeMark(from, to, mark),
      );
    if (found) dispatch?.(tr);
    return found;
  };
}

/** Names the comment thread a suggestion is discussed in, on each of its marks. */
export function linkSuggestionThread(suggestion: string, thread: string): Command {
  return (state, dispatch) => {
    const { insertion, deletion } = state.schema.marks;
    const tr = state.tr;
    const found = eachMark(
      tr,
      (mark) =>
        (mark.type === insertion || mark.type === deletion) && mark.attrs.dataId === suggestion,
      ([from, to], mark) => {
        tr.removeMark(from, to, mark);
        tr.addMark(from, to, mark.type.create({ ...mark.attrs, commentId: thread }));
      },
    );
    if (found) dispatch?.(tr);
    return found;
  };
}
