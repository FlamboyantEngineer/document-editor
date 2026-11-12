// Tracked formatting: while suggesting, a change to a run's marks or a block's type or attributes
// is made at once and recorded as a suggestion of the formatting it replaced, so rejecting it
// restores that formatting and accepting it drops the record. Text marks record it in a format
// change mark; blocks in their `suggestionFormat` attribute.

import type { Attrs, Mark, Node as ProseMirrorNode } from 'prosemirror-model';
import type { Transaction } from 'prosemirror-state';
import { AddMarkStep, AttrStep, RemoveMarkStep, type Step } from 'prosemirror-transform';
import { inlineRuns, type Suggesting } from './suggestions.js';

/** A mark as a format change records it. */
export interface RecordedMark {
  readonly type: string;
  readonly attrs: Attrs;
}

/** What a block's `suggestionFormat` holds: the suggestion, and the type and attributes before. */
export interface BlockFormatRecord {
  readonly id: string;
  readonly author: string | null;
  readonly type: string;
  readonly attrs: Attrs;
}

// Marks that are not formatting: review, authorship and references.
const UNTRACKED_MARKS = new Set([
  'insertion',
  'deletion',
  'format_change',
  'comment_highlight',
  'contributor',
  'reference',
]);

// Block attributes that are not formatting: identity, layout and review.
const UNTRACKED_ATTRS = new Set([
  'dataId',
  'dataAuthor',
  'dataAiSession',
  'splitPartIndex',
  'orphanedListContinuation',
  'suggestionSplitKind',
  'suggestionSplitId',
  'suggestionFormat',
]);

const formattingOf = (marks: readonly Mark[]): RecordedMark[] =>
  marks
    .filter((mark) => !UNTRACKED_MARKS.has(mark.type.name))
    .map((mark) => ({ type: mark.type.name, attrs: mark.attrs }));

// A block's formatting attributes that differ from their defaults, as a record keeps them.
function formatAttrsOf(node: ProseMirrorNode): Attrs {
  const specs = node.type.spec.attrs ?? {};
  return Object.fromEntries(
    Object.entries(node.attrs).filter(
      ([name, value]) =>
        !UNTRACKED_ATTRS.has(name) &&
        JSON.stringify(value) !== JSON.stringify(specs[name]?.default),
    ),
  );
}

// JSON with object keys sorted, so equal values read back in another order compare equal.
const stable = (value: unknown): string =>
  JSON.stringify(value, (_key, each: unknown) =>
    each && typeof each === 'object' && !Array.isArray(each)
      ? Object.fromEntries(Object.entries(each).sort(([x], [y]) => x.localeCompare(y)))
      : each,
  );
const same = (a: unknown, b: unknown) => stable(a) === stable(b);

const canRecord = (node: ProseMirrorNode) =>
  Object.hasOwn(node.type.spec.attrs ?? {}, 'suggestionFormat');

/** A block's format record, when it has one. */
export function blockFormatOf(node: ProseMirrorNode): BlockFormatRecord | null {
  const record: unknown = node.attrs.suggestionFormat;
  if (!record || typeof record !== 'object') return null;
  const { id, type } = record as Partial<BlockFormatRecord>;
  return typeof id === 'string' && typeof type === 'string' ? (record as BlockFormatRecord) : null;
}

// Whether a run or block is the writer's own suggested insertion, whose formatting is its own.
function isOwnInsertion(suggesting: Suggesting, marks: readonly Mark[]) {
  const inserted = suggesting.insertion.isInSet(marks);
  return Boolean(inserted && inserted.attrs.dataAuthor === suggesting.author);
}

// Records a mark step's change on each run it touched.
function recordMarks(suggesting: Suggesting, step: AddMarkStep | RemoveMarkStep): boolean {
  const { tr } = suggesting;
  const formatChange = tr.doc.type.schema.marks.format_change;
  const before = inlineRuns(tr.doc, step.from, step.to);
  if (tr.maybeStep(step).failed) return false;
  if (!formatChange) return true;
  const own = before
    .map((run) => formatChange.isInSet(run.marks))
    .find((mark) => mark?.attrs.dataAuthor === suggesting.author);
  const id = own ? String(own.attrs.dataId) : suggesting.newId();
  for (const run of before) {
    if (isOwnInsertion(suggesting, run.marks)) continue;
    const recorded = formatChange.isInSet(run.marks);
    const original = recorded ? (recorded.attrs.before as RecordedMark[]) : formattingOf(run.marks);
    const now = formattingOf(tr.doc.nodeAt(run.from)?.marks ?? []);
    tr.removeMark(run.from, run.to, formatChange);
    if (same(original, now)) continue;
    const attrs = {
      dataId: recorded?.attrs.dataAuthor === suggesting.author ? recorded.attrs.dataId : id,
      dataAuthor: suggesting.author,
      commentId: recorded?.attrs.commentId ?? null,
      before: original,
    };
    tr.addMark(run.from, run.to, formatChange.create(attrs));
  }
  return true;
}

// Whether a block step changes no formatting a record keeps: identity or layout, a block that
// cannot hold a record, or the writer's own suggested block.
function isUntracked(suggesting: Suggesting, step: Step, node: ProseMirrorNode | null) {
  if (!node || !canRecord(node)) return true;
  if (step instanceof AttrStep && UNTRACKED_ATTRS.has(step.attr)) return true;
  const { suggestionSplitKind, dataAuthor } = node.attrs;
  return suggestionSplitKind === 'insertion' && dataAuthor === suggesting.author;
}

// Records a block step's change of type or attributes on the block.
function recordBlock(suggesting: Suggesting, step: Step, pos: number): boolean {
  const { tr } = suggesting;
  const node = tr.doc.nodeAt(pos);
  const untracked = isUntracked(suggesting, step, node);
  const record = node ? blockFormatOf(node) : null;
  const original = record ?? {
    type: String(node?.type.name),
    attrs: node ? formatAttrsOf(node) : {},
  };
  if (tr.maybeStep(step).failed) return false;
  const after = tr.doc.nodeAt(pos);
  if (untracked || !after || !canRecord(after)) return true;
  const now = { type: after.type.name, attrs: formatAttrsOf(after) };
  const before = { type: original.type, attrs: original.attrs };
  const next: BlockFormatRecord | null = same(before, now)
    ? null
    : { id: record?.id ?? suggesting.newId(), author: suggesting.author, ...before };
  tr.setNodeAttribute(pos, 'suggestionFormat', next);
  return true;
}

/**
 * Applies a step that changes formatting, already mapped onto the suggestion, and records the
 * formatting it replaced. Returns whether the step applied, or undefined for a step that changes
 * no formatting.
 */
export function suggestFormatting(
  suggesting: Suggesting,
  step: Step,
  { markup }: { markup: boolean },
): boolean | undefined {
  if (step instanceof AddMarkStep || step instanceof RemoveMarkStep) {
    if (UNTRACKED_MARKS.has(step.mark.type.name)) return undefined;
    return recordMarks(suggesting, step);
  }
  if (step instanceof AttrStep) return recordBlock(suggesting, step, step.pos);
  if (markup && 'from' in step && typeof step.from === 'number') {
    return recordBlock(suggesting, step, step.from);
  }
  return undefined;
}

/** A node's format change parts: its run's format change mark, or its block record. */
export function formatPartsOf(node: ProseMirrorNode) {
  const parts: { dataId: string | null; thread: string | null; author: string | null }[] = [];
  const block = blockFormatOf(node);
  if (block) parts.push({ dataId: block.id, thread: null, author: block.author });
  const mark = node.type.schema.marks.format_change?.isInSet(node.marks);
  if (mark) {
    const text = (value: unknown) => (typeof value === 'string' && value ? value : null);
    parts.push({
      dataId: text(mark.attrs.dataId),
      thread: text(mark.attrs.commentId),
      author: text(mark.attrs.dataAuthor),
    });
  }
  return parts;
}

// Puts a run's formatting back as a format change recorded it.
function restoreMarks(tr: Transaction, [from, to]: readonly [number, number], mark: Mark) {
  const { schema } = tr.doc.type;
  const node = tr.doc.nodeAt(from);
  for (const each of node?.marks ?? []) {
    if (!UNTRACKED_MARKS.has(each.type.name)) tr.removeMark(from, to, each);
  }
  for (const { type, attrs } of mark.attrs.before as RecordedMark[]) {
    const markType = schema.marks[type];
    if (markType) tr.addMark(from, to, markType.create(attrs));
  }
}

/**
 * Accepts or rejects the format changes on a node at a position whose suggestions `chosen` names:
 * accepting drops the record, rejecting restores the formatting it replaced.
 */
export function decideFormatting(
  tr: Transaction,
  pos: number,
  {
    reject,
    chosen,
  }: { reject: boolean; chosen: (dataId: string | null, thread: string | null) => boolean },
): void {
  const node = tr.doc.nodeAt(pos);
  if (!node) return;
  const block = blockFormatOf(node);
  if (block && chosen(block.id, null)) {
    const type = reject ? tr.doc.type.schema.nodes[block.type] : node.type;
    const kept = Object.fromEntries(
      Object.entries(node.attrs).filter(([name]) => UNTRACKED_ATTRS.has(name)),
    );
    const attrs = reject ? { ...block.attrs, ...kept } : node.attrs;
    try {
      tr.setNodeMarkup(pos, type, { ...attrs, suggestionFormat: null });
    } catch {
      tr.setNodeAttribute(pos, 'suggestionFormat', null);
    }
  }
  const mark = tr.doc.type.schema.marks.format_change?.isInSet(node.marks);
  if (!mark || !chosen(mark.attrs.dataId as string | null, mark.attrs.commentId as string | null))
    return;
  const range = [pos, pos + node.nodeSize] as const;
  if (reject) restoreMarks(tr, range, mark);
  tr.removeMark(range[0], range[1], mark);
}
