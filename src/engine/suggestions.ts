// Suggestions: changes a writer proposes rather than makes. In suggest mode a local change is
// rewritten so it removes nothing: typed text is kept as a suggested insertion, deleted text stays
// in place as a suggested deletion, and a split block keeps the original as a suggested deletion
// beside its two halves as suggested insertions. Each change belongs to a suggestion, named by an
// id its marks and blocks share, which a reader accepts or rejects whole.

import { isHistoryTransaction } from 'prosemirror-history';
import type { Fragment, Mark, MarkType, Node as ProseMirrorNode, Slice } from 'prosemirror-model';
import { type EditorState, PluginKey, TextSelection, type Transaction } from 'prosemirror-state';
import { Mapping, ReplaceAroundStep, ReplaceStep, type Step } from 'prosemirror-transform';
import { addMarkInOrder } from '../model/index.js';
import { createElementId } from './element-ids.js';
import { suggestFormatting } from './suggested-formatting.js';
import { isSystemChange } from './transaction-kind.js';

/** Marks a transaction a suggestion built or decided, which suggest mode leaves as it is. */
export const suggestionsKey = new PluginKey('suggestions');

/** Who suggests, and how a suggestion's id is made. */
export interface SuggestOptions {
  /** The writer the suggestion is attributed to, or null for none. */
  author?: string | null | undefined;
  /** Makes a fresh suggestion id; random by default. */
  newId?: (() => string) | undefined;
}

/** A change being rewritten as a suggestion, and who suggests it. */
export interface Suggesting {
  readonly tr: Transaction;
  readonly insertion: MarkType;
  readonly deletion: MarkType;
  readonly author: string | null;
  readonly newId: () => string;
}

const hasKindAttrs = (node: ProseMirrorNode) =>
  Object.hasOwn(node.type.spec.attrs ?? {}, 'suggestionSplitKind');

const suggestionOf = (marks: readonly Mark[], type: MarkType) =>
  marks.find((mark) => mark.type === type) ?? null;

// The id of a suggestion of a type by the same writer that touches a position, to extend it.
function adjacentId(suggesting: Suggesting, pos: number, type: MarkType): string | null {
  const $pos = suggesting.tr.doc.resolve(pos);
  for (const node of [$pos.nodeBefore, $pos.nodeAfter]) {
    const mark = node ? suggestionOf(node.marks, type) : null;
    if (mark && mark.attrs.dataAuthor === suggesting.author) return String(mark.attrs.dataId);
  }
  return null;
}

function markOf(suggesting: Suggesting, type: MarkType, id: string): Mark {
  return type.create({ dataId: id, dataAuthor: suggesting.author });
}

/** Inline content in a range: each run of text or inline leaves, with its marks. */
export function inlineRuns(doc: ProseMirrorNode, from: number, to: number) {
  const runs: { from: number; to: number; marks: readonly Mark[] }[] = [];
  doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isInline) return true;
    runs.push({
      from: Math.max(from, pos),
      to: Math.min(to, pos + node.nodeSize),
      marks: node.marks,
    });
    return false;
  });
  return runs;
}

/**
 * Suggests deleting a range: text the same writer suggested inserting goes, the rest is marked as
 * a suggested deletion. Returns the suggestion's id, or null when the range holds no text.
 */
function suggestDeletion(suggesting: Suggesting, [from, to]: readonly [number, number]) {
  const { tr, insertion, deletion, author } = suggesting;
  const runs = inlineRuns(tr.doc, from, to);
  if (!runs.length) return null;
  const group =
    adjacentId(suggesting, from, deletion) ??
    adjacentId(suggesting, to, deletion) ??
    suggesting.newId();
  const own = runs.filter((run) => suggestionOf(run.marks, insertion)?.attrs.dataAuthor === author);
  for (const run of runs) {
    if (own.includes(run) || suggestionOf(run.marks, deletion)) continue;
    addMarkInOrder(tr, run, markOf(suggesting, deletion, group));
  }
  for (const run of [...own].reverse()) tr.delete(run.from, run.to);
  return group;
}

// Marks a range's inline content as one suggested insertion.
function markInserted(suggesting: Suggesting, [from, to]: readonly [number, number], id: string) {
  const { tr, insertion, deletion } = suggesting;
  tr.removeMark(from, to, deletion);
  tr.removeMark(from, to, insertion);
  addMarkInOrder(tr, { from, to }, markOf(suggesting, insertion, id));
}

// A slice's inline content, when it holds nothing else.
function inlineContent(slice: Slice): Fragment | null {
  if (slice.openStart !== slice.openEnd) return null;
  let content = slice.content;
  for (let depth = 0; depth < slice.openStart; depth += 1) {
    if (content.childCount !== 1 || !content.firstChild?.isTextblock) return null;
    content = content.firstChild.content;
  }
  let inline = true;
  content.forEach((node) => {
    if (!node.isInline) inline = false;
  });
  return inline ? content : null;
}

// A copy of a block suggested as an insertion, without the original's id.
function insertedBlock(
  suggesting: Suggesting,
  node: ProseMirrorNode,
  { id, content = node.content }: { id: string; content?: Fragment },
): ProseMirrorNode {
  const attrs = {
    ...node.attrs,
    dataId: null,
    dataAuthor: suggesting.author,
    splitPartIndex: null,
    suggestionSplitKind: 'insertion',
    suggestionSplitId: id,
  };
  return node.type.create(attrs, content, node.marks);
}

// Marks the inline content of every block in a range as inserted.
function markBlocksInserted(
  suggesting: Suggesting,
  [from, to]: readonly [number, number],
  id: string,
) {
  for (const run of inlineRuns(suggesting.tr.doc, from, to)) {
    markInserted(suggesting, [run.from, run.to], id);
  }
}

/**
 * Suggests splitting a text block at a position, as Enter does: at either end an empty block is
 * suggested before or after it; inside it, the block is suggested for deletion and its two halves
 * as insertions after it. Returns the caret's position, or null when it cannot be suggested.
 */
function suggestSplit(suggesting: Suggesting, pos: number, slice: Slice): number | null {
  const { tr } = suggesting;
  const $pos = tr.doc.resolve(pos);
  const source = $pos.parent;
  const after = slice.content.lastChild;
  if (!source.isTextblock || !after) return null;
  const id = suggesting.newId();
  const start = $pos.before();
  const end = $pos.after();
  if ($pos.parentOffset === source.content.size) {
    if (!hasKindAttrs(after)) return null;
    tr.insert(end, insertedBlock(suggesting, after.type.create(after.attrs), { id }));
    return end + 1;
  }
  if (!hasKindAttrs(source) || source.attrs.splitPartIndex !== null) return null;
  if ($pos.parentOffset === 0) {
    tr.insert(start, insertedBlock(suggesting, source.type.create(source.attrs), { id }));
    return start + 3;
  }
  const leading = insertedBlock(suggesting, source, {
    id,
    content: source.content.cut(0, $pos.parentOffset),
  });
  const trailing = insertedBlock(suggesting, hasKindAttrs(after) ? after : source, {
    id,
    content: source.content.cut($pos.parentOffset),
  });
  tr.setNodeMarkup(start, null, {
    ...source.attrs,
    suggestionSplitKind: 'deletion',
    suggestionSplitId: id,
  });
  addMarkInOrder(tr, { from: start + 1, to: end - 1 }, markOf(suggesting, suggesting.deletion, id));
  tr.insert(end, [leading, trailing]);
  markBlocksInserted(suggesting, [end, end + leading.nodeSize + trailing.nodeSize], id);
  return end + leading.nodeSize + 1;
}

// Suggests inserting whole blocks at a block boundary. Null when one cannot record it.
function suggestBlocks(suggesting: Suggesting, pos: number, slice: Slice): number | null {
  if (slice.openStart || slice.openEnd) return null;
  const blocks: ProseMirrorNode[] = [];
  const id = suggesting.newId();
  let recordable = true;
  slice.content.forEach((node) => {
    if (!hasKindAttrs(node)) recordable = false;
    else blocks.push(insertedBlock(suggesting, node, { id }));
  });
  if (!recordable || !blocks.length) return null;
  const size = blocks.reduce((sum, node) => sum + node.nodeSize, 0);
  suggesting.tr.insert(pos, blocks);
  markBlocksInserted(suggesting, [pos, pos + size], id);
  return pos + size;
}

// Whether a step splits one text block, as Enter does.
const isSplit = (slice: Slice) =>
  slice.openStart === 1 &&
  slice.openEnd === 1 &&
  slice.content.childCount === 2 &&
  slice.content.size === 4;

// Suggests one replacement, and gives where the caret goes, or null when it cannot be suggested.
function suggestReplace(
  suggesting: Suggesting,
  [from, to]: readonly [number, number],
  { slice, backward }: { slice: Slice; backward: boolean },
): number | null {
  const { tr } = suggesting;
  const inline = inlineContent(slice);
  if (inline) {
    const before = tr.steps.length;
    const id = from < to ? suggestDeletion(suggesting, [from, to]) : null;
    const map = tr.mapping.slice(before);
    if (!inline.size) return backward || from === to ? map.map(from, -1) : map.map(to, 1);
    const at = map.map(to, 1);
    // Typing beside the writer's own deletion, as after Backspace, replaces what it deletes.
    const group =
      id ??
      adjacentId(suggesting, at, suggesting.insertion) ??
      adjacentId(suggesting, at, suggesting.deletion) ??
      suggesting.newId();
    tr.insert(at, inline);
    markInserted(suggesting, [at, at + inline.size], group);
    return at + inline.size;
  }
  if (from !== to) return null;
  return isSplit(slice)
    ? suggestSplit(suggesting, from, slice)
    : suggestBlocks(suggesting, from, slice);
}

// A step that only sets a block's type or attributes, as a command does after splitting it.
const isMarkupStep = (step: Step) =>
  step instanceof ReplaceAroundStep &&
  step.insert === 1 &&
  step.gapFrom === step.from + 1 &&
  step.gapTo === step.to - 1 &&
  step.slice.content.childCount === 1;

// Rewrites each step of a change onto `suggesting`'s transaction. Returns where the caret goes,
// undefined when no step places it, or null when a step cannot be suggested.
function rewriteSteps(
  suggesting: Suggesting,
  tr: Transaction,
  selection: EditorState['selection'],
): number | null | undefined {
  const out = suggesting.tr;
  let mapping = new Mapping();
  let caret: number | undefined;
  let structural = false;
  for (const [index, step] of tr.steps.entries()) {
    const start = out.steps.length;
    if (step instanceof ReplaceStep) {
      const range = [mapping.map(step.from, -1), mapping.map(step.to, 1)] as const;
      const backward = index === 0 && selection.empty && selection.head === step.to;
      const placed = suggestReplace(suggesting, range, { slice: step.slice, backward });
      if (placed === null) return null;
      structural ||= step.slice.openStart > 0 || !inlineContent(step.slice);
      caret = placed;
    } else if (structural && isMarkupStep(step)) {
      // The suggested blocks already carry the attributes the command sets on them.
    } else {
      const mapped = step.map(mapping);
      if (!mapped || !suggestFormatting(suggesting, mapped, { markup: isMarkupStep(step) }))
        return null;
    }
    const next = new Mapping();
    next.appendMap(step.getMap().invert());
    next.appendMapping(mapping);
    next.appendMapping(out.mapping.slice(start));
    mapping = next;
  }
  return caret;
}

/**
 * Rewrites a local change as a suggestion by `author`: the result removes nothing, and marks what
 * the change adds and deletes as suggested. A change that does not edit content, or that comes
 * from a suggestion, the pagination or elsewhere, is returned as it is; one a suggestion cannot
 * record, such as a structural change inside a list or table, gives null and should be dropped.
 */
export function suggestTransaction(
  tr: Transaction,
  state: EditorState,
  { author = null, newId = createElementId }: SuggestOptions = {},
): Transaction | null {
  const { insertion, deletion } = state.schema.marks;
  if (!insertion || !deletion || !tr.docChanged) return tr;
  if (tr.getMeta(suggestionsKey) || tr.getMeta('addToHistory') === false || isSystemChange(tr))
    return tr;
  // Undo and redo replay changes that were already suggestions, so they stay as they are.
  if (isHistoryTransaction(tr)) return tr;
  const out = state.tr.setMeta(suggestionsKey, 'suggest');
  const caret = rewriteSteps({ tr: out, insertion, deletion, author, newId }, tr, state.selection);
  if (caret === null) return null;
  if (caret !== undefined) {
    const pos = Math.min(Math.max(caret, 0), out.doc.content.size);
    out.setSelection(TextSelection.near(out.doc.resolve(pos)));
  }
  if (tr.scrolledIntoView) out.scrollIntoView();
  return out;
}
