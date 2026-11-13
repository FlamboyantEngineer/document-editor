// Portable comment targets: where a thread's text is, by the element id of each text block it
// marks and offsets inside it, with the text, so a thread can be found again without its marks,
// as a shared room's commenters keep it, and a thread whose marks were lost can be anchored again.
// A text block's offsets count each character and each inline object as one, as positions do.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { Command, EditorState } from 'prosemirror-state';
import type { CommentTarget, CommentTargetRange } from '../host/index.js';
import { commentAnchors, placeCommentAnchors, type PlacedAnchor } from './comment-anchors.js';
import { commentDraft } from './comment-draft.js';
import {
  anchorCommentRanges,
  type AnchorOptions,
  type CommentRange,
  type CommentState,
  listCommentAnchors,
  removeCommentAnchor,
} from './comments.js';

/** Where a target was found: its ranges, and whether each was where the target said. */
export interface ResolvedTarget {
  readonly ranges: readonly CommentRange[];
  readonly exact: boolean;
}

/** A thread as the anchors need it: its id, state, scope and target. */
export interface AnchoredThread {
  readonly id: string;
  readonly state: CommentState;
  /** About part of the text (the default), or the whole document, which has no anchor. */
  readonly scope?: 'text' | 'document' | undefined;
  readonly target?: CommentTarget | null | undefined;
}

/** How a document's anchors and a list of threads agree, by thread id. */
export interface ThreadReconcileReport {
  /** Threads the document's marks anchor. */
  readonly anchored: string[];
  /** Threads without marks whose target is where it said. */
  readonly placed: string[];
  /** Threads without marks whose target was found elsewhere, by its text. */
  readonly reanchored: string[];
  /** Text threads with neither marks nor a target that can be found. */
  readonly orphaned: string[];
  /** Threads about the whole document, which are never orphaned. */
  readonly document: string[];
  /** Anchors in the document whose thread is not in the list. */
  readonly unknown: string[];
}

// The text of a text block with each inline object as one character, so offsets are positions.
const blockText = (block: ProseMirrorNode) =>
  block.textBetween(0, block.content.size, undefined, '￼');

/**
 * The portable target of a thread's anchor in an editor's document; null when the document does
 * not anchor it, or a text block it marks has no element id.
 */
export function describeCommentTarget(state: EditorState, thread: string): CommentTarget | null {
  const anchor = commentAnchors(state).find((each) => each.thread === thread);
  return anchor ? targetOf(state.doc, anchor.ranges, anchor.text) : null;
}

/**
 * The portable target of the thread being started (`startCommentDraft`), so the thread can be
 * stored with it; null without a draft, or when a text block it covers has no element id.
 */
export function describeDraftTarget(state: EditorState): CommentTarget | null {
  const draft = commentDraft(state);
  if (!draft) return null;
  const quote = draft.ranges
    .map(({ from, to }) => state.doc.textBetween(from, to, ' ', ' '))
    .join(' ');
  return targetOf(state.doc, draft.ranges, quote);
}

// A range cut at the edges of the text blocks it crosses, as a selection across blocks is.
function byTextBlock(doc: ProseMirrorNode, { from, to }: CommentRange): CommentRange[] {
  const parts: CommentRange[] = [];
  doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isTextblock) return true;
    const start = Math.max(from, pos + 1);
    const end = Math.min(to, pos + 1 + node.content.size);
    if (start < end) parts.push({ from: start, to: end });
    return false;
  });
  return parts;
}

// The target of ranges, each cut to the text blocks it covers, every one with an element id.
function targetOf(
  doc: ProseMirrorNode,
  found: readonly CommentRange[],
  quote: string,
): CommentTarget | null {
  const ranges: CommentTargetRange[] = [];
  for (const { from, to } of found.flatMap((range) => byTextBlock(doc, range))) {
    const $from = doc.resolve(from);
    const element: unknown = $from.parent.attrs.dataId;
    if (typeof element !== 'string' || !element) return null;
    const start = $from.parentOffset;
    ranges.push({
      element,
      start,
      end: start + to - from,
      text: blockText($from.parent).slice(start, start + to - from),
    });
  }
  return ranges.length ? { ranges, quote } : null;
}

// The text blocks of a document by element id, found in one walk.
function blocksById(doc: ProseMirrorNode) {
  const blocks = new Map<string, { node: ProseMirrorNode; start: number }>();
  doc.descendants((node, pos) => {
    const id: unknown = node.attrs.dataId;
    if (node.isTextblock && typeof id === 'string' && !blocks.has(id)) {
      blocks.set(id, { node, start: pos + 1 });
    }
    return !node.isTextblock;
  });
  return blocks;
}

// The occurrence of a text in a block's text nearest an offset, or -1.
function nearest(text: string, value: string, near: number): number {
  let best = -1;
  for (let at = text.indexOf(value); at >= 0; at = text.indexOf(value, at + 1)) {
    if (best < 0 || Math.abs(at - near) < Math.abs(best - near)) best = at;
  }
  return best;
}

type Blocks = ReturnType<typeof blocksById>;

// A target range in its element: at its offsets when its text is there, else its text nearest.
function resolveRange(blocks: Blocks, range: CommentTargetRange) {
  const block = blocks.get(range.element);
  if (!block || !range.text) return null;
  const text = blockText(block.node);
  if (text.slice(range.start, range.end) === range.text) {
    return { from: block.start + range.start, to: block.start + range.end, exact: true };
  }
  const at = nearest(text, range.text, range.start);
  if (at < 0) return null;
  return { from: block.start + at, to: block.start + at + range.text.length, exact: false };
}

// The quote's first occurrence inside one text block of a document.
function findQuote(blocks: Blocks, quote: string): CommentRange | null {
  if (!quote.trim()) return null;
  for (const { node, start } of blocks.values()) {
    const at = blockText(node).indexOf(quote);
    if (at >= 0) return { from: start + at, to: start + at + quote.length };
  }
  return null;
}

function resolveIn(blocks: Blocks, target: CommentTarget): ResolvedTarget | null {
  const found = target.ranges.map((range) => resolveRange(blocks, range));
  if (found.length > 0 && found.every((range) => range !== null)) {
    return {
      ranges: found.map(({ from, to }) => ({ from, to })).sort((a, b) => a.from - b.from),
      exact: found.every((range) => range.exact),
    };
  }
  const quoted = findQuote(blocks, target.quote);
  return quoted ? { ranges: [quoted], exact: false } : null;
}

/**
 * Finds a target in a document: each range at its offsets in its element when its text is still
 * there, else its text nearest them in that element, else the quote in any one text block; null
 * when none is found.
 */
export function resolveCommentTarget(
  doc: ProseMirrorNode,
  target: CommentTarget,
): ResolvedTarget | null {
  return resolveIn(blocksById(doc), target);
}

/**
 * Anchors a thread again where its target is found, replacing any marks it has; refused when the
 * target is not found.
 */
export function reanchorThread(
  thread: string,
  target: CommentTarget,
  options: AnchorOptions = {},
): Command {
  return (state, dispatch) => {
    const found = resolveCommentTarget(state.doc, target);
    if (!found) return false;
    let tr = state.tr;
    removeCommentAnchor(thread)(state, (removed) => (tr = removed));
    if (!anchorCommentRanges(tr, { thread, ranges: found.ranges }, options)) return false;
    dispatch?.(tr);
    return true;
  };
}

/**
 * How a document's anchors and a list of threads agree: which threads its marks anchor, which
 * their targets place, exactly or found again by their text, which are orphaned, which are about
 * the whole document, and which anchors name no listed thread.
 */
export function reconcileThreads(
  doc: ProseMirrorNode,
  threads: readonly AnchoredThread[],
): ThreadReconcileReport {
  const marked = new Set(listCommentAnchors(doc).map((anchor) => anchor.thread));
  const report: ThreadReconcileReport = {
    anchored: [],
    placed: [],
    reanchored: [],
    orphaned: [],
    document: [],
    unknown: [],
  };
  const blocks = blocksById(doc);
  for (const thread of threads) {
    if (thread.scope === 'document') report.document.push(thread.id);
    else if (marked.has(thread.id)) report.anchored.push(thread.id);
    else {
      const found = thread.target ? resolveIn(blocks, thread.target) : null;
      const kind = !found ? 'orphaned' : found.exact ? 'placed' : 'reanchored';
      report[kind].push(thread.id);
    }
  }
  const listed = new Set(threads.map((thread) => thread.id));
  report.unknown.push(...[...marked].filter((thread) => !listed.has(thread)));
  return report;
}

/**
 * Places the anchors of the listed text threads that no mark anchors where their targets are
 * found, drawn and listed like marked anchors without changing the document, as when the reader
 * may write only a shared room's comments; replaces the threads placed before.
 */
export function anchorThreads(threads: readonly AnchoredThread[]): Command {
  return (state, dispatch) => {
    const marked = new Set(listCommentAnchors(state.doc).map((anchor) => anchor.thread));
    const blocks = blocksById(state.doc);
    const placed = new Map<string, PlacedAnchor>();
    for (const thread of threads) {
      if (thread.scope === 'document' || marked.has(thread.id) || !thread.target) continue;
      const found = resolveIn(blocks, thread.target);
      if (found) placed.set(thread.id, { state: thread.state, ranges: found.ranges });
    }
    dispatch?.(placeCommentAnchors(state.tr, placed));
    return true;
  };
}
