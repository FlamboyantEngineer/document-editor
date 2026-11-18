// What a change of a room's content did to comments and suggestions, read from the content before
// and after it (DOCE-COLLAB-6.6). The two are compared rather than the Yjs change read op by op:
// a change may express the same edit in several ways, as marking the next equal character and
// inserting a plain one after it for a character typed before its twin.

import type { Mark, Node } from 'prosemirror-model';
import {
  entryFootnote,
  type FootnoteSuggestions,
  readFootnoteSuggestions,
} from './room-change-footnotes.js';
import {
  type Alignment,
  alignUnits,
  commonEnds,
  type Unit,
  type UnitCosts,
  unitsOf,
} from './room-change-units.js';

/** A permission a change of a room may need. */
export type RoomChangePermission = 'edit' | 'suggest' | 'decide' | 'comment';

/**
 * What a change of the content did, before knowing its writer: the permissions it needs from
 * anyone, the writers of the suggestions it adds, which only they may add (`suggest`, `edit` for
 * anyone else), and the writers of the suggestions it withdraws, which they withdraw with `suggest`
 * and anyone else rejects with `decide`.
 */
export interface ContentChange {
  readonly needs: ReadonlySet<RoomChangePermission>;
  readonly proposed: ReadonlySet<string | null>;
  readonly withdrawn: ReadonlySet<string | null>;
}

const COMMENT_MARKS: ReadonlySet<string> = new Set(['comment_highlight']);
const SUGGESTION_MARKS: ReadonlySet<string> = new Set(['insertion', 'deletion', 'format_change']);
const SUGGESTED_MARKS: ReadonlySet<string> = new Set(['insertion', 'deletion']);
// The block attributes a suggestion sets, as `suggestions.ts` and `suggested-split.ts` do. The part
// of a split block a node is (`splitPartIndex`) is the pages' alone, which a room never holds.
const SUGGESTION_ATTRS: ReadonlySet<string> = new Set([
  'suggestionSplitKind',
  'suggestionSplitId',
  'suggestionFormat',
]);

interface ContentInspection {
  marks?: (before: readonly Mark[], after: readonly Mark[]) => void;
  nodes?: (before: Node, after: Node) => void;
  inserted?: (node: Node) => void;
}

// What a change records as it is read.
function createTally(inspection: ContentInspection = {}, footnotes?: FootnoteSuggestions) {
  const needs = new Set<RoomChangePermission>();
  const proposed = new Set<string | null>();
  const withdrawn = new Set<string | null>();
  return {
    inspectMarks: inspection.marks ?? (() => undefined),
    inspectNode: inspection.nodes ?? (() => undefined),
    inspectInserted: inspection.inserted ?? (() => undefined),
    footnotes: footnotes ?? { come: new Map<string, string | null>(), gone: new Map() },
    need(permission: RoomChangePermission | null) {
      if (permission) needs.add(permission);
    },
    proposed(author: string | null) {
      proposed.add(author);
    },
    withdrawn(author: string | null) {
      withdrawn.add(author);
    },
    result: (): ContentChange => ({ needs, proposed, withdrawn }),
  };
}

type Tally = ReturnType<typeof createTally>;

const hasMark = (marks: readonly Mark[], names: ReadonlySet<string>): boolean =>
  marks.some((mark) => names.has(mark.type.name));

const sameValue = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

const authorOf = (attrs: Readonly<Record<string, unknown>>): string | null =>
  typeof attrs.dataAuthor === 'string' ? attrs.dataAuthor : null;

// The writer of a block's suggestion: the block's own author for a suggested insertion; for a
// block suggested for deletion, which keeps its original author, the writer of its deletion marks.
function suggestionAuthor(node: Node): string | null {
  if (node.attrs.suggestionSplitKind !== 'deletion') return authorOf(node.attrs);
  let author: string | null = null;
  node.descendants((child) => {
    const mark = child.marks.find((each) => each.type.name === 'deletion');
    if (mark && author === null) author = authorOf(mark.attrs);
    return author === null;
  });
  return author;
}

// A node's attribute change: setting a suggestion's attributes proposes it; clearing them accepts
// a suggested insertion (a decision) or withdraws a suggested deletion; any other attribute is an
// edit.
function readAttrs(tally: Tally, a: Node, b: Node): void {
  const names = new Set([...Object.keys(a.attrs), ...Object.keys(b.attrs)]);
  const changed = [...names].filter((name) => !sameValue(a.attrs[name], b.attrs[name]));
  if (changed.length === 0) return;
  if (!changed.some((name) => SUGGESTION_ATTRS.has(name))) return tally.need('edit');
  if (b.attrs.suggestionSplitKind || b.attrs.suggestionFormat) tally.proposed(suggestionAuthor(b));
  else if (a.attrs.suggestionSplitKind === 'deletion') tally.withdrawn(suggestionAuthor(a));
  else tally.need('decide');
}

// A change of marks. A suggestion mark added proposes it; an insertion mark taken off accepts it
// and a format suggestion taken off decides it, both decisions; a deletion mark taken off
// withdraws or rejects it. Formatting beside a format suggestion is the suggestion's own, as is the
// contributor mark an accepted insertion leaves; any other mark is an edit, and comment highlights
// alone are a comment.
function readMarks(tally: Tally, a: readonly Mark[], b: readonly Mark[]): void {
  const added = b.filter((mark) => !mark.isInSet(a));
  const removed = a.filter((mark) => !mark.isInSet(b));
  const changed = [...added, ...removed];
  if (changed.length === 0) return;
  const isSuggestion = (mark: Mark) => SUGGESTION_MARKS.has(mark.type.name);
  for (const mark of added.filter(isSuggestion)) tally.proposed(authorOf(mark.attrs));
  // Text still suggested as an insertion after the change moved from one suggestion to another:
  // it withdraws the first, as rewriting it does.
  const stillInserted = b.some((mark) => mark.type.name === 'insertion');
  for (const mark of removed.filter(isSuggestion)) {
    const name = mark.type.name;
    if (name === 'deletion' || (name === 'insertion' && stillInserted))
      tally.withdrawn(authorOf(mark.attrs));
    else tally.need('decide');
  }
  // Accepting an insertion leaves its writer's contributor mark in its place.
  const accepted = removed.some((mark) => mark.type.name === 'insertion') && !stillInserted;
  const others = changed.filter(
    (mark) => !isSuggestion(mark) && !(accepted && mark.type.name === 'contributor'),
  );
  if (changed.some((mark) => mark.type.name === 'format_change')) return;
  if (others.some((mark) => !COMMENT_MARKS.has(mark.type.name))) tally.need('edit');
  else if (others.length > 0) tally.need('comment');
}

// What a unit that goes needs: text or a block suggested as an insertion (or a suggested split)
// is withdrawn by its writer or rejected; text or a block suggested as a deletion goes when the
// deletion is accepted, a decision; any other text or block start is an edit.
function readGone(tally: Tally, unit: Unit): void {
  if (unit.isBlock && unit.node) return readGoneBlock(tally, unit.node);
  const insertion = unit.marks.find((mark) => mark.type.name === 'insertion');
  if (insertion) tally.withdrawn(authorOf(insertion.attrs));
  else if (unit.marks.some((mark) => mark.type.name === 'deletion')) tally.need('decide');
  else tally.need('edit');
}

// A block that goes: by its suggestion kind, or, with none, as its text when all of it is
// suggested, so withdrawing or deciding the text takes the block with it.
function readGoneBlock(tally: Tally, node: Node): void {
  const kind: unknown = node.attrs.suggestionSplitKind;
  const footnote = entryFootnote(node);
  if (footnote !== null && tally.footnotes.gone.has(footnote))
    return tally.withdrawn(tally.footnotes.gone.get(footnote) ?? null);
  if (kind === 'deletion') return tally.need('decide');
  if (kind) return tally.withdrawn(suggestionAuthor(node));
  if (!isSuggestedBlock(node)) return tally.need('edit');
  node.descendants((child) => {
    if (child.isInline)
      readGone(tally, { text: null, node: child, isBlock: false, marks: child.marks });
    return !child.isInline;
  });
}

// The writer of a unit that comes as a suggested insertion, or undefined when it is not one: the
// entry of a footnote the change suggests comes with its marker.
function comeAuthor(unit: Unit, footnotes: FootnoteSuggestions): string | null | undefined {
  if (!unit.isBlock || !unit.node) {
    const mark = unit.marks.find((each) => each.type.name === 'insertion');
    return mark ? authorOf(mark.attrs) : undefined;
  }
  const footnote = entryFootnote(unit.node);
  if (footnote !== null && footnotes.come.has(footnote)) return footnotes.come.get(footnote);
  if (unit.node.attrs.suggestionSplitKind !== 'insertion') return undefined;
  return authorOf(unit.node.attrs);
}

// What a unit needs as an alignment reads it, to cost it; the writer is not known yet.
function costOfReading(read: (tally: Tally) => void, footnotes: FootnoteSuggestions): number {
  const tally = createTally({}, footnotes);
  read(tally);
  const { needs, proposed, withdrawn } = tally.result();
  if (needs.has('edit')) return COSTS.edit;
  if (needs.has('decide')) return COSTS.decide;
  if (needs.has('suggest') || proposed.size + withdrawn.size > 0) return COSTS.suggest;
  return needs.has('comment') ? COSTS.comment : 0;
}

// An alignment costs most for an edit, and a decision more than a suggestion, so units are read
// the way that needs the least: a suggestion copied into the halves of a suggested split reads as
// kept, not as deleted text accepted and suggested again.
const COSTS = { comment: 1, suggest: 100, decide: 150, edit: 10_000 } as const;
const unitCosts = (footnotes: FootnoteSuggestions): UnitCosts => ({
  gone: (unit) => costOfReading((tally) => readGone(tally, unit), footnotes),
  come: (unit) => (comeAuthor(unit, footnotes) === undefined ? COSTS.edit : COSTS.suggest),
  kept: (a, b) => costOfReading((tally) => readKept(tally, a, b), footnotes),
});

// Keeping a unit with other marks, or a block with other attributes.
function readKept(tally: Tally, a: Unit, b: Unit): void {
  tally.inspectMarks(a.marks, b.marks);
  if (a.isBlock && a.node && b.node) tally.inspectNode(a.node, b.node);
  if (a.isBlock && a.node && b.node) readAttrs(tally, a.node, b.node);
  readMarks(tally, a.marks, b.marks);
}

// The units a change aligns: kept ones change marks (and a block's attributes), what goes must be
// suggested, what comes the writer's own suggested insertion.
function readUnits(tally: Tally, { pairs, gone, come }: Alignment): void {
  for (const [was, is] of pairs) readKept(tally, was, is);
  for (const unit of gone) readGone(tally, unit);
  for (const unit of come) {
    tally.inspectMarks([], unit.marks);
    if (unit.isBlock && unit.node) tally.inspectInserted(unit.node);
    const author = comeAuthor(unit, tally.footnotes);
    if (author === undefined) tally.need('edit');
    else tally.proposed(author);
  }
}

// Reads aligned units; false, reading nothing, when they are too long to align.
function readAligned(tally: Tally, before: Unit[], after: Unit[]): boolean {
  const alignment = alignUnits(before, after, unitCosts(tally.footnotes));
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
    for (const node of gone) readGoneBlock(tally, node);
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
  tally.inspectNode(a, b);
  tally.inspectMarks(a.marks, b.marks);
  readAttrs(tally, a, b);
  readMarks(tally, a.marks, b.marks);
  if (a.content.eq(b.content)) return;
  if (a.inlineContent && b.inlineContent) {
    if (!readAligned(tally, unitsOf(a), unitsOf(b))) tally.need('edit');
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
export function readContentChange(
  before: Node,
  after: Node,
  inspection: ContentInspection = {},
): ContentChange {
  const tally = createTally(inspection, readFootnoteSuggestions(before, after));
  readNode(tally, before, after);
  return tally.result();
}
