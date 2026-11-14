// What a change of a room's content did to comments and suggestions, read from the content before
// and after it (DOCE-COLLAB-6.6). The two are compared rather than the Yjs change read op by op:
// a change may express the same edit in several ways, as marking the next equal character and
// inserting a plain one after it for a character typed before its twin.

import type { Mark, Node } from 'prosemirror-model';
import {
  type Alignment,
  alignUnits,
  commonEnds,
  type Unit,
  type UnitCosts,
  unitsOf,
} from './room-change-units.js';

type Tier = 'comment' | 'review' | 'content';

/**
 * What a change of the content did: the highest tier it needs before knowing its writer, and who
 * wrote each suggested insertion it adds, which is a review only for that writer.
 */
export interface ContentChange {
  readonly tier: Tier | null;
  readonly authors: ReadonlySet<string | null>;
}

const COMMENT_MARKS: ReadonlySet<string> = new Set(['comment_highlight']);
const SUGGESTION_MARKS: ReadonlySet<string> = new Set(['insertion', 'deletion', 'format_change']);
const SUGGESTED_MARKS: ReadonlySet<string> = new Set(['insertion', 'deletion']);
// The block attributes a suggestion sets, as `suggestions.ts` and `suggested-split.ts` do.
const SUGGESTION_ATTRS: ReadonlySet<string> = new Set([
  'suggestionSplitKind',
  'suggestionSplitId',
  'splitPartIndex',
  'suggestionFormat',
]);
const RANKS: Readonly<Record<Tier, number>> = { comment: 1, review: 2, content: 3 };

function highest(a: Tier | null, b: Tier | null): Tier | null {
  if (a === null) return b;
  if (b === null) return a;
  return RANKS[a] >= RANKS[b] ? a : b;
}

// What a change records as it is read: the tier so far and the writers of suggested insertions.
function createTally() {
  let tier: Tier | null = null;
  const authors = new Set<string | null>();
  return {
    add(next: Tier | null) {
      tier = highest(tier, next);
    },
    inserted(author: string | null) {
      tier = highest(tier, 'review');
      authors.add(author);
    },
    result: (): ContentChange => ({ tier, authors }),
  };
}

type Tally = ReturnType<typeof createTally>;

const sameValue = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

// A node's attribute change: one that sets or clears a suggestion's attributes is a review.
function attrsTier(a: Node, b: Node): Tier | null {
  const names = new Set([...Object.keys(a.attrs), ...Object.keys(b.attrs)]);
  const changed = [...names].filter((name) => !sameValue(a.attrs[name], b.attrs[name]));
  if (changed.length === 0) return null;
  return changed.some((name) => SUGGESTION_ATTRS.has(name)) ? 'review' : 'content';
}

// A change of marks: a suggestion's marks (and what deciding one changes beside them) are a
// review, comment highlights alone a comment, any other formatting content.
function marksTier(a: readonly Mark[], b: readonly Mark[]): Tier | null {
  const changed = [
    ...a.filter((mark) => !mark.isInSet(b)),
    ...b.filter((mark) => !mark.isInSet(a)),
  ].map((mark) => mark.type.name);
  if (changed.length === 0) return null;
  if (changed.some((name) => SUGGESTION_MARKS.has(name))) return 'review';
  return changed.every((name) => COMMENT_MARKS.has(name)) ? 'comment' : 'content';
}

const hasMark = (marks: readonly Mark[], names: ReadonlySet<string>): boolean =>
  marks.some((mark) => names.has(mark.type.name));

// The writer of the suggested insertion among marks, or undefined when there is none.
function insertionAuthor(marks: readonly Mark[]): string | null | undefined {
  const mark = marks.find((each) => each.type.name === 'insertion');
  if (!mark) return undefined;
  const author: unknown = mark.attrs.dataAuthor;
  return typeof author === 'string' ? author : null;
}

// What a unit that goes needs: suggested text or a suggested block is a review.
function goneTier(unit: Unit): Tier {
  const suggested =
    unit.isBlock && unit.node ? isSuggestedBlock(unit.node) : hasMark(unit.marks, SUGGESTED_MARKS);
  return suggested ? 'review' : 'content';
}

// The writer of a unit that comes as a suggested insertion, or undefined when it is not one.
function comeAuthor(unit: Unit): string | null | undefined {
  if (!unit.isBlock || !unit.node) return insertionAuthor(unit.marks);
  if (unit.node.attrs.suggestionSplitKind !== 'insertion') return undefined;
  const author: unknown = unit.node.attrs.dataAuthor;
  return typeof author === 'string' ? author : null;
}

// What keeping a unit with other marks, or a block with other attributes, needs.
function keptTier(a: Unit, b: Unit): Tier | null {
  const attrs = a.isBlock && a.node && b.node ? attrsTier(a.node, b.node) : null;
  return highest(attrs, marksTier(a.marks, b.marks));
}

// An alignment costs most for content, so units are read the way that needs the least.
const COSTS: Readonly<Record<Tier, number>> = { comment: 1, review: 100, content: 10_000 };
const costOf = (tier: Tier | null): number => (tier ? COSTS[tier] : 0);
const UNIT_COSTS: UnitCosts = {
  gone: (unit) => costOf(goneTier(unit)),
  come: (unit) => costOf(comeAuthor(unit) === undefined ? 'content' : 'review'),
  kept: (a, b) => costOf(keptTier(a, b)),
};

// The units a change aligns: kept ones change marks (and a block's attributes), what goes must be
// suggested, what comes the writer's own suggested insertion.
function readUnits(tally: Tally, { pairs, gone, come }: Alignment): void {
  for (const [was, is] of pairs) tally.add(keptTier(was, is));
  for (const unit of gone) tally.add(goneTier(unit));
  for (const unit of come) {
    const author = comeAuthor(unit);
    if (author === undefined) tally.add('content');
    else tally.inserted(author);
  }
}

// Reads aligned units; false, reading nothing, when they are too long to align.
function readAligned(tally: Tally, before: Unit[], after: Unit[]): boolean {
  const alignment = alignUnits(before, after, UNIT_COSTS);
  if (alignment) readUnits(tally, alignment);
  return alignment !== null;
}

// A block that deleting decides on or withdraws: one suggested, or all of whose text is.
function isSuggestedBlock(node: Node): boolean {
  if (node.attrs.suggestionSplitKind) return true;
  let suggested = true;
  node.descendants((child) => {
    if (child.isInline && !hasMark(child.marks, SUGGESTED_MARKS)) suggested = false;
    return suggested;
  });
  return suggested && node.content.size > 0;
}

// A block a change inserts: the writer's suggested block, all of whose text is suggested.
function readInserted(tally: Tally, node: Node): void {
  const units = [{ text: null, node, isBlock: true, marks: node.marks }];
  node.descendants((child) => {
    if (child.isInline) units.push({ text: null, node: child, isBlock: false, marks: child.marks });
    return !child.isInline;
  });
  readUnits(tally, { pairs: [], gone: [], come: units });
}

const idOf = (node: Node): unknown => node.attrs.dataId ?? null;
const isSameElement = (a: Node, b: Node): boolean =>
  a.type === b.type && idOf(a) !== null && idOf(a) === idOf(b);

// A run of text blocks, read as one text when it is short enough to align: whether it was.
function readTextRun(tally: Tally, gone: readonly Node[], come: readonly Node[]): boolean {
  if (![...gone, ...come].every((node) => node.isTextblock)) return false;
  const units = (nodes: readonly Node[]) => nodes.flatMap((node) => unitsOf(node, true));
  return readAligned(tally, units(gone), units(come));
}

// A run of changed children between two that stay: pairs by place when it holds as many children
// of the same types, as one text when it is all text blocks, and is replaced otherwise.
function readRun(tally: Tally, gone: readonly Node[], come: readonly Node[]): void {
  if (gone.length === come.length && gone.every((node, index) => node.type === come[index]?.type))
    gone.forEach((node, index) => readNode(tally, node, come[index] as Node));
  else if (!readTextRun(tally, gone, come)) {
    for (const node of gone) tally.add(isSuggestedBlock(node) ? 'review' : 'content');
    for (const node of come) readInserted(tally, node);
  }
}

// The changed children: text blocks as one text when short enough, which follows text from block
// to block as deciding a suggested split moves it; otherwise paired as the same element by id, in
// order, with the runs between pairs read on their own.
function readChildren(tally: Tally, a: readonly Node[], b: readonly Node[]): void {
  const ends = commonEnds(a, b, (x, y) => x.eq(y));
  const gone = a.slice(ends.start, a.length - ends.end);
  const come = b.slice(ends.start, b.length - ends.end);
  if (readTextRun(tally, gone, come)) return;
  let from = 0;
  let to = 0;
  for (let index = 0; index < gone.length; index += 1) {
    const node = gone[index] as Node;
    const match = come.findIndex((other, at) => at >= to && isSameElement(node, other));
    if (match < 0) continue;
    readRun(tally, gone.slice(from, index), come.slice(to, match));
    readNode(tally, node, come[match] as Node);
    from = index + 1;
    to = match + 1;
  }
  readRun(tally, gone.slice(from), come.slice(to));
}

function readNode(tally: Tally, a: Node, b: Node): void {
  if (a.eq(b)) return;
  tally.add(attrsTier(a, b));
  tally.add(marksTier(a.marks, b.marks));
  if (a.content.eq(b.content)) return;
  if (a.inlineContent && b.inlineContent) {
    if (!readAligned(tally, unitsOf(a), unitsOf(b))) tally.add('content');
    return;
  }
  const children = (node: Node) => {
    const list: Node[] = [];
    node.forEach((child) => list.push(child));
    return list;
  };
  readChildren(tally, children(a), children(b));
}

/** What a change of the content did, from the content before and after it. */
export function readContentChange(before: Node, after: Node): ContentChange {
  const tally = createTally();
  readNode(tally, before, after);
  return tally.result();
}
