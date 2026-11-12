// Comment anchors: the text a comment thread is about, marked with the thread's id
// (`comment_highlight`) and its state, so the anchor follows the text through edits and is stored
// with the document. The threads themselves live in the host's comment store.

import type { Mark, MarkType, Node as ProseMirrorNode } from 'prosemirror-model';
import type { Command, EditorState, Transaction } from 'prosemirror-state';
import { addMarkInOrder } from '../model/index.js';
import { createElementId } from './element-ids.js';

/** Whether a comment thread is open or resolved. */
export type CommentState = 'open' | 'resolved';

/** A range of the document, by its positions. */
export interface CommentRange {
  readonly from: number;
  readonly to: number;
}

/** The text a comment thread is anchored to. */
export interface CommentAnchor {
  readonly thread: string;
  readonly state: CommentState;
  /** The start of its first range and the end of its last. */
  readonly from: number;
  readonly to: number;
  /** Each stretch of text it marks, in reading order, as edits or pages may part it. */
  readonly ranges: readonly CommentRange[];
  /** The anchored text, as the thread quotes it; its ranges' text joined by spaces. */
  readonly text: string;
}

const anchorType = (schema: EditorState['schema']): MarkType | undefined =>
  schema.marks.comment_highlight;

interface FoundAnchor {
  thread: string;
  state: CommentState;
  ranges: { from: number; to: number; text: string }[];
}

// Adds an inline node a thread's mark covers to its anchor, extending its last range when it
// continues it.
function extendAnchor(
  found: Map<string, FoundAnchor>,
  mark: Mark,
  { node, pos }: { readonly node: ProseMirrorNode; readonly pos: number },
) {
  const thread: unknown = mark.attrs.commentId;
  if (typeof thread !== 'string') return;
  const entry = found.get(thread) ?? {
    thread,
    state: mark.attrs.commentState === 'resolved' ? 'resolved' : 'open',
    ranges: [],
  };
  const last = entry.ranges.at(-1);
  const text = node.text ?? '';
  if (last?.to === pos) {
    last.to = pos + node.nodeSize;
    last.text += text;
  } else {
    entry.ranges.push({ from: pos, to: pos + node.nodeSize, text });
  }
  found.set(thread, entry);
}

/** Orders anchors by where they start, an outer one before those it holds, then by thread. */
export function compareAnchors(a: CommentAnchor, b: CommentAnchor): number {
  return a.from - b.from || b.to - a.to || (a.thread < b.thread ? -1 : a.thread > b.thread ? 1 : 0);
}

/**
 * The comment anchors of a document in reading order, one per thread, with every range it marks:
 * threads that nest in or overlap one another each keep their own anchor.
 */
export function listCommentAnchors(doc: ProseMirrorNode): CommentAnchor[] {
  const type = anchorType(doc.type.schema);
  if (!type) return [];
  const found = new Map<string, FoundAnchor>();
  doc.descendants((node, pos) => {
    if (!node.isInline) return true;
    for (const mark of node.marks) if (mark.type === type) extendAnchor(found, mark, { node, pos });
    return false;
  });
  return [...found.values()]
    .map(({ thread, state, ranges }) => ({
      thread,
      state,
      from: ranges[0]?.from ?? 0,
      to: ranges.at(-1)?.to ?? 0,
      ranges: ranges.map(({ from, to }) => ({ from, to })),
      text: ranges.map((range) => range.text).join(' '),
    }))
    .sort(compareAnchors);
}

/** How a new anchor is identified. */
export interface AnchorOptions {
  /** Makes the anchor's element id; random by default. */
  readonly newId?: (() => string) | undefined;
}

/**
 * The stretches of text a selection covers in reading order: one for a text selection, one per
 * cell for a cell selection; only those holding text.
 */
export function selectionRanges(state: EditorState): CommentRange[] {
  if (state.selection.empty) return [];
  return state.selection.ranges
    .map(({ $from, $to }) => ({ from: $from.pos, to: $to.pos }))
    .filter(({ from, to }) => from < to && state.doc.textBetween(from, to).trim() !== '')
    .sort((a, b) => a.from - b.from);
}

/** The selected text, as a new comment would quote it; empty without a selection. */
export function selectedText(state: EditorState): string {
  return selectionRanges(state)
    .map(({ from, to }) => state.doc.textBetween(from, to, ' ', ' '))
    .join(' ');
}

/**
 * Anchors a comment thread to ranges of a transaction's document, under one new element id;
 * returns whether it could, which needs text in a range and comment anchors in the schema.
 */
export function anchorCommentRanges(
  tr: Transaction,
  { thread, ranges }: { readonly thread: string; readonly ranges: readonly CommentRange[] },
  { newId = createElementId }: AnchorOptions = {},
): boolean {
  const type = anchorType(tr.doc.type.schema);
  const marked = ranges.filter(
    ({ from, to }) => from < to && tr.doc.textBetween(from, to).trim() !== '',
  );
  if (!type || marked.length === 0) return false;
  const mark = type.create({ dataId: newId(), commentId: thread, commentState: 'open' });
  for (const range of marked) addMarkInOrder(tr, range, mark);
  return true;
}

/**
 * Anchors a comment thread to the selected text, each selected cell its own range. Refused without
 * text in the selection, or when the schema has no comment anchors.
 */
export function addCommentAnchor(thread: string, options: AnchorOptions = {}): Command {
  return (state, dispatch) => {
    const tr = state.tr;
    if (!anchorCommentRanges(tr, { thread, ranges: selectionRanges(state) }, options)) return false;
    dispatch?.(tr);
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
          addMarkInOrder(tr, { from, to }, type.create({ ...mark.attrs, commentState: next }));
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
        addMarkInOrder(tr, { from, to }, mark.type.create({ ...mark.attrs, commentId: thread }));
      },
    );
    if (found) dispatch?.(tr);
    return found;
  };
}
