// The comment anchors of a document, kept as an index that follows each change instead of walking
// the document: a change rescans only the text blocks it touches, so typing walks one block, and
// the margin, the panel and the handle read the anchors from the index. The anchor holding the
// caret is drawn active (`data-comment-active`).

import type { Mark, Node as ProseMirrorNode } from 'prosemirror-model';
import { type EditorState, Plugin, PluginKey, type Transaction } from 'prosemirror-state';
import {
  AddMarkStep,
  AttrStep,
  DocAttrStep,
  type Mapping,
  RemoveMarkStep,
  ReplaceAroundStep,
  ReplaceStep,
  type Step,
} from 'prosemirror-transform';
import { Decoration, DecorationSet } from 'prosemirror-view';
import {
  type CommentAnchor,
  type CommentRange,
  type CommentState,
  compareAnchors,
  listCommentAnchors,
} from './comments.js';

// One stretch of an anchor, with its text and the state its mark gives.
interface IndexedRange extends CommentRange {
  readonly text: string;
  readonly state: CommentState;
}

/** The anchors by thread, each with its stretches in reading order. */
type AnchorIndex = ReadonlyMap<string, readonly IndexedRange[]>;

// How many text blocks a change may touch before the index is built again from the document.
const rescanLimit = 64;

const isAnchorMark = (mark: Mark) =>
  mark.type.name === 'comment_highlight' && typeof mark.attrs.commentId === 'string';

// Adds the stretches a text block's anchor marks cover to the index, joining runs that continue.
function scanBlock(index: Map<string, IndexedRange[]>, block: ProseMirrorNode, start: number) {
  block.forEach((child, offset) => {
    const from = start + offset;
    const to = from + child.nodeSize;
    for (const mark of child.marks) {
      if (!isAnchorMark(mark)) continue;
      const thread = String(mark.attrs.commentId);
      const ranges = index.get(thread) ?? [];
      const last = ranges.at(-1);
      const text = child.text ?? '';
      if (last?.to === from) ranges[ranges.length - 1] = { ...last, to, text: last.text + text };
      else {
        const state = mark.attrs.commentState === 'resolved' ? 'resolved' : 'open';
        ranges.push({ from, to, text, state });
      }
      index.set(thread, ranges);
    }
  });
}

// The text blocks a range of a document touches, by the position their content starts at.
function blocksIn(doc: ProseMirrorNode, { from, to }: CommentRange): Map<number, ProseMirrorNode> {
  const blocks = new Map<number, ProseMirrorNode>();
  const [$from, $to] = [doc.resolve(from), doc.resolve(to)];
  for (const $pos of [$from, $to]) {
    if ($pos.parent.isTextblock) blocks.set($pos.start(), $pos.parent);
  }
  if (from < to && !($from.parent.isTextblock && $from.sameParent($to))) {
    doc.nodesBetween(from, to, (node, pos) => {
      if (node.isTextblock) blocks.set(pos + 1, node);
      return !node.isTextblock && !node.isLeaf;
    });
  }
  return blocks;
}

function buildIndex(doc: ProseMirrorNode): AnchorIndex {
  const index = new Map<string, IndexedRange[]>();
  doc.descendants((node, pos) => {
    if (node.isTextblock) scanBlock(index, node, pos + 1);
    return !node.isTextblock;
  });
  return index;
}

// Where a step changed the document it made, in the document the transaction ends with; null for
// a step the index does not know, which rebuilds it.
function changedRanges(step: Step, after: Mapping): CommentRange[] | null {
  if (step instanceof AttrStep || step instanceof DocAttrStep) return [];
  const span = (from: number, to: number) => ({
    from: after.map(from, -1),
    to: Math.max(after.map(from, -1), after.map(to, 1)),
  });
  if (step instanceof AddMarkStep || step instanceof RemoveMarkStep) {
    return [span(step.from, step.to)];
  }
  if (!(step instanceof ReplaceStep || step instanceof ReplaceAroundStep)) return null;
  const map = step.getMap();
  return [span(map.map(step.from, -1), map.map(step.to, 1))];
}

// The index after a change: every stretch mapped, and the blocks the change touched scanned again.
function updateIndex(index: AnchorIndex, tr: Transaction): AnchorIndex {
  const touched: CommentRange[] = [];
  for (const [i, step] of tr.steps.entries()) {
    const ranges = changedRanges(step, tr.mapping.slice(i + 1));
    if (!ranges) return buildIndex(tr.doc);
    touched.push(...ranges);
  }
  const blocks = new Map<number, ProseMirrorNode>();
  for (const range of touched) {
    for (const [at, block] of blocksIn(tr.doc, range)) blocks.set(at, block);
  }
  // A change over much of the document, such as replacing it, is as quick to scan whole.
  if (blocks.size > rescanLimit) return buildIndex(tr.doc);
  // A stretch in a scanned block, or one a change spread over several blocks, is scanned again.
  const inScanned = ({ from, to }: CommentRange) =>
    [...blocks].some(([at, block]) => from <= at + block.content.size && to >= at);
  const next = new Map<string, IndexedRange[]>();
  for (const [thread, ranges] of index) {
    const kept = ranges
      .map((range) => ({
        ...range,
        from: tr.mapping.map(range.from, 1),
        to: tr.mapping.map(range.to, -1),
      }))
      .filter((range) => range.from < range.to && !inScanned(range));
    if (kept.length > 0) next.set(thread, kept);
  }
  for (const [at, block] of blocks) scanBlock(next, block, at);
  for (const ranges of next.values()) ranges.sort((a, b) => a.from - b.from);
  return next;
}

// The marked anchors, and the anchors placed by threads' targets where no mark anchors them.
interface AnchorsState {
  readonly marks: AnchorIndex;
  readonly placed: AnchorIndex;
}

const anchorsKey = new PluginKey<AnchorsState>('comment-anchors');

/** A thread's anchor placed by its target: its state and its ranges. */
export interface PlacedAnchor {
  readonly state: CommentState;
  readonly ranges: readonly CommentRange[];
}

// The placed anchors after a change: mapped, their text read again, and those a mark now anchors
// or the change emptied dropped.
function updatePlaced(placed: AnchorIndex, marks: AnchorIndex, tr: Transaction): AnchorIndex {
  const next = new Map<string, IndexedRange[]>();
  for (const [thread, ranges] of placed) {
    if (marks.has(thread)) continue;
    const kept = ranges
      .map((range) => ({
        ...range,
        from: tr.mapping.map(range.from, 1),
        to: tr.mapping.map(range.to, -1),
      }))
      .filter((range) => range.from < range.to)
      .map((range) => ({ ...range, text: tr.doc.textBetween(range.from, range.to, ' ', ' ') }));
    if (kept.length > 0) next.set(thread, kept);
  }
  return next;
}

/**
 * Places the anchors of threads that no mark anchors, as a shared room's commenters keep them, by
 * thread; they are drawn and listed like marked anchors and follow the text, but are not stored.
 */
export function placeCommentAnchors(
  tr: Transaction,
  anchors: ReadonlyMap<string, PlacedAnchor>,
): Transaction {
  const placed = new Map<string, IndexedRange[]>();
  for (const [thread, { state, ranges }] of anchors) {
    const sorted = ranges
      .filter(({ from, to }) => from < to)
      .map(({ from, to }) => ({ from, to, state, text: tr.doc.textBetween(from, to, ' ', ' ') }))
      .sort((a, b) => a.from - b.from);
    if (sorted.length > 0) placed.set(thread, sorted);
  }
  return tr.setMeta(anchorsKey, placed);
}

function applyAnchors(tr: Transaction, value: AnchorsState): AnchorsState {
  const placed = tr.getMeta(anchorsKey) as AnchorIndex | undefined;
  if (!tr.docChanged) return placed ? { ...value, placed } : value;
  const marks = updateIndex(value.marks, tr);
  return { marks, placed: updatePlaced(placed ?? value.placed, marks, tr) };
}

const listed = new WeakMap<AnchorsState, CommentAnchor[]>();

function listOf(value: AnchorsState): CommentAnchor[] {
  const known = listed.get(value);
  if (known) return known;
  const placed = [...value.placed].filter(([thread]) => !value.marks.has(thread));
  const anchors = [...value.marks, ...placed].map(([thread, ranges]) => ({
    thread,
    state: ranges[0]?.state ?? 'open',
    from: ranges[0]?.from ?? 0,
    to: ranges.at(-1)?.to ?? 0,
    ranges: ranges.map(({ from, to }) => ({ from, to })),
    text: ranges.map((range) => range.text).join(' '),
  }));
  anchors.sort(compareAnchors);
  listed.set(value, anchors);
  return anchors;
}

/**
 * The comment anchors of an editor's document in reading order, one per thread, as
 * `listCommentAnchors` gives them, with the placed anchors: from the index when the editor keeps
 * one, else by walking the document.
 */
export function commentAnchors(state: EditorState): CommentAnchor[] {
  const value = anchorsKey.getState(state);
  return value ? listOf(value) : listCommentAnchors(state.doc);
}

// The placed anchors drawn as stored anchors are, marked as placed.
function placedDecorations(placed: AnchorIndex): Decoration[] {
  return [...placed].flatMap(([thread, ranges]) =>
    ranges.map(({ from, to, state }) =>
      Decoration.inline(from, to, {
        nodeName: 'mark',
        'data-comment-id': thread,
        'data-comment-state': state,
        'data-comment-placed': 'true',
      }),
    ),
  );
}

/**
 * The thread whose anchor holds the caret, the innermost when anchors nest, or null; at an edge,
 * an anchor holds the caret only from inside.
 */
export function activeCommentThread(state: EditorState): string | null {
  const { head } = state.selection;
  let active: { thread: string; size: number } | null = null;
  for (const anchor of commentAnchors(state)) {
    const range = anchor.ranges.find(({ from, to }) => from <= head && head <= to);
    if (!range || (active && active.size <= range.to - range.from)) continue;
    active = { thread: anchor.thread, size: range.to - range.from };
  }
  return active?.thread ?? null;
}

/**
 * Keeps the index of a document's comment anchors and the placed anchors, draws the placed ones,
 * and draws the anchor holding the caret with `data-comment-active`.
 */
export function createCommentAnchors(): Plugin<AnchorsState> {
  return new Plugin<AnchorsState>({
    key: anchorsKey,
    state: {
      init: (_config, state) => ({ marks: buildIndex(state.doc), placed: new Map() }),
      apply: applyAnchors,
    },
    props: {
      decorations(state) {
        const value = anchorsKey.getState(state);
        const thread = activeCommentThread(state);
        const anchor = thread && commentAnchors(state).find((each) => each.thread === thread);
        const active = (anchor ? anchor.ranges : []).map(({ from, to }) =>
          Decoration.inline(from, to, { 'data-comment-active': 'true' }),
        );
        const placed = value ? placedDecorations(value.placed) : [];
        if (active.length === 0 && placed.length === 0) return null;
        return DecorationSet.create(state.doc, [...placed, ...active]);
      },
    },
  });
}
