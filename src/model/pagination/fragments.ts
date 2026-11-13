// A block that does not fit on a page is split into fragments, one per page, each a node of the
// block's own type marked as a part. Joining puts the fragments back into one whole block, so the
// stored document and the editing document never hold pages' parts. Each splittable type has a rule.
// Joins are steps on a transform, so positions in the fragments map onto the whole block.

import {
  Fragment,
  type Node as ProseMirrorNode,
  type NodeType,
  type Schema,
} from 'prosemirror-model';
import { Transform } from 'prosemirror-transform';

type Attrs = Record<string, unknown>;

/** How one node type's fragments are recognised and joined. */
export interface FragmentRule {
  /** The attribute values of a whole block; a node holding any other value is a fragment. */
  readonly whole: Readonly<Attrs>;
  /** Whether `next` continues `previous`; by default, both are the same split element. */
  continues?: (previous: ProseMirrorNode, next: ProseMirrorNode) => boolean;
  /**
   * Joins the fragment that starts at `pos` into the block that ends there, by steps on the
   * transform; by default their content joins. The joined block takes the rule's whole attributes.
   */
  join?: (tr: Transform, pos: number, rules: FragmentRules) => void;
}

/** Fragment rules by node type name. */
export type FragmentRules = Readonly<Record<string, FragmentRule>>;

const PART = { splitPartIndex: null } as const;

function ruleFor(rules: FragmentRules, name: string): FragmentRule | undefined {
  return Object.hasOwn(rules, name) ? rules[name] : undefined;
}

function partIndex(node: ProseMirrorNode): number {
  const index = node.attrs.splitPartIndex as unknown;
  return typeof index === 'number' && Number.isInteger(index) && index >= 0 ? index : -1;
}

/** Whether a node is a fragment of a split block under the rules. */
export function isFragment(node: ProseMirrorNode, rules: FragmentRules = FRAGMENT_RULES): boolean {
  const rule = ruleFor(rules, node.type.name);
  if (!rule) return false;
  return Object.entries(rule.whole).some(([name, value]) => (node.attrs[name] ?? null) !== value);
}

// Two nodes of one type, one of them a fragment, that are the same element: they share an id, or
// their part numbers follow on.
function sameSplitElement(previous: ProseMirrorNode, next: ProseMirrorNode, rules: FragmentRules) {
  if (!isFragment(previous, rules) && !isFragment(next, rules)) return false;
  const id = previous.attrs.dataId as unknown;
  if (id && id === next.attrs.dataId) return true;
  const index = partIndex(previous);
  return index >= 0 && partIndex(next) === index + 1;
}

/** Whether `next` is the fragment that follows `previous`. */
export function continuesFragment(
  previous: ProseMirrorNode,
  next: ProseMirrorNode,
  rules: FragmentRules = FRAGMENT_RULES,
): boolean {
  if (previous.type !== next.type) return false;
  const rule = ruleFor(rules, next.type.name);
  if (!rule) return false;
  if (rule.continues) return isFragment(next, rules) && rule.continues(previous, next);
  return sameSplitElement(previous, next, rules);
}

// Gives the node at `pos` its rule's whole attributes.
function wholeAttrs(
  tr: Transform,
  { pos, node }: { readonly pos: number; readonly node: ProseMirrorNode },
  rules: FragmentRules,
): void {
  const rule = ruleFor(rules, node.type.name);
  if (!rule) return;
  for (const [name, value] of Object.entries(rule.whole)) {
    if ((node.attrs[name] ?? null) !== value) tr.setNodeAttribute(pos, name, value);
  }
}

/** Gives the node at `pos` its rule's whole attributes, so a fragment becomes a whole block. */
export function makeWhole(tr: Transform, pos: number, rules: FragmentRules = FRAGMENT_RULES): void {
  const node = tr.doc.nodeAt(pos);
  if (node) wholeAttrs(tr, { pos, node }, rules);
}

/** Joins the fragment that starts at `pos` into the block that ends there, by its type's rule. */
export function joinAt(tr: Transform, pos: number, rules: FragmentRules = FRAGMENT_RULES): void {
  const previous = tr.doc.resolve(pos).nodeBefore;
  if (!previous) return;
  const start = pos - previous.nodeSize;
  const rule = ruleFor(rules, previous.type.name);
  if (rule?.join) rule.join(tr, pos, rules);
  else tr.join(pos);
  makeWhole(tr, start, rules);
}

/** Sibling blocks in a transform's document: where the first starts, and the blocks before joins. */
export interface BlockRun {
  readonly from: number;
  readonly blocks: readonly ProseMirrorNode[];
}

/**
 * Joins each run of fragments among sibling blocks in the transform's document; a fragment whose
 * other parts are missing becomes whole.
 */
export function joinBlocks(
  tr: Transform,
  { from, blocks }: BlockRun,
  rules: FragmentRules = FRAGMENT_RULES,
): void {
  // Where the next block starts, carried through the steps each block takes, so no block is looked
  // up again among its siblings.
  let next = from;
  let previous: ProseMirrorNode | undefined;
  for (const block of blocks) {
    const steps = tr.steps.length;
    if (previous && continuesFragment(previous, block, rules)) joinAt(tr, next, rules);
    else wholeAttrs(tr, { pos: next, node: block }, rules);
    next = tr.mapping.slice(steps).map(next + block.nodeSize);
    previous = block;
  }
}

function children(node: ProseMirrorNode): ProseMirrorNode[] {
  const nodes: ProseMirrorNode[] = [];
  node.forEach((child) => nodes.push(child));
  return nodes;
}

// A node type that holds the blocks, for the transform that joins them: the document, or for
// blocks that only go inside another, such as list items, one that holds them.
function containerFor(blocks: readonly ProseMirrorNode[], { schema }: NodeType): NodeType {
  const content = Fragment.from([...blocks]);
  const types = [schema.topNodeType, ...Object.values(schema.nodes)];
  return types.find((type) => type.validContent(content)) ?? schema.topNodeType;
}

/**
 * Blocks in order with every run of fragments joined into its whole block; a fragment whose other
 * parts are missing becomes whole on its own.
 */
export function joinFragments(
  blocks: readonly ProseMirrorNode[],
  rules: FragmentRules = FRAGMENT_RULES,
): ProseMirrorNode[] {
  const [first] = blocks;
  if (!first) return [];
  const tr = new Transform(containerFor(blocks, first.type).create(null, blocks));
  joinBlocks(tr, { from: 0, blocks }, rules);
  return children(tr.doc);
}

// After two containers join at `pos`, their facing children meet one position inside.
function joinFacingChildren(tr: Transform, inner: number, rules: FragmentRules) {
  const $inner = tr.doc.resolve(inner);
  const { nodeBefore, nodeAfter } = $inner;
  if (nodeBefore && nodeAfter && continuesFragment(nodeBefore, nodeAfter, rules)) {
    joinAt(tr, inner, rules);
  }
}

function joinContainers(tr: Transform, pos: number, rules: FragmentRules) {
  tr.join(pos);
  joinFacingChildren(tr, pos - 1, rules);
}

/**
 * Whether a node is the empty paragraph a split leaves where a fragment has nothing of its own: at
 * the start of a list item's continuation, or in a column with no block on that side. The split
 * marks it (`continuationPlaceholder`), so an empty paragraph of the document is never taken
 * for one.
 */
export function isContinuationPlaceholder(node: ProseMirrorNode | null | undefined): boolean {
  return (
    node?.type.name === 'paragraph' &&
    node.content.size === 0 &&
    node.attrs.continuationPlaceholder === true
  );
}

/** The empty paragraph a split leaves where a fragment has nothing of its own, marked as such. */
export function continuationPlaceholder(schema: Schema): ProseMirrorNode | null {
  return schema.nodes.paragraph?.create({ continuationPlaceholder: true }) ?? null;
}

function joinListItems(tr: Transform, pos: number, rules: FragmentRules) {
  tr.join(pos);
  const inner = pos - 1;
  const placeholder = tr.doc.nodeAt(inner);
  if (isContinuationPlaceholder(placeholder) && placeholder) {
    tr.delete(inner, inner + placeholder.nodeSize);
  }
  joinFacingChildren(tr, inner, rules);
}

// A column holding only the empty paragraph a layout section's split leaves where it had nothing.
function holdsOnlyPlaceholder(column: ProseMirrorNode): boolean {
  return column.childCount === 1 && isContinuationPlaceholder(column.firstChild);
}

// Each column of the section that starts at `pos` joins its column in the section before, in order,
// and their facing blocks join when they are one block's fragments. The second section's content
// moves, so positions in it map to where it was.
function joinLayoutSections(tr: Transform, pos: number, rules: FragmentRules) {
  const { nodeBefore: previous, nodeAfter: next } = tr.doc.resolve(pos);
  if (!previous || !next) return;
  const start = pos - previous.nodeSize;
  tr.delete(pos, pos + next.nodeSize);
  let columnPos = start + 1;
  children(next).forEach((extra, index) => {
    const column = index < previous.childCount ? tr.doc.nodeAt(columnPos) : null;
    if (!column) {
      tr.insert(columnPos, extra);
      columnPos += extra.nodeSize;
      return;
    }
    const end = columnPos + column.nodeSize - 1;
    if (holdsOnlyPlaceholder(column)) {
      tr.replaceWith(columnPos + 1, end, extra.content);
    } else if (!holdsOnlyPlaceholder(extra)) {
      tr.insert(end, extra.content);
      joinFacingChildren(tr, end, rules);
    }
    columnPos += tr.doc.nodeAt(columnPos)?.nodeSize ?? 0;
  });
}

function isHeaderRow(row: ProseMirrorNode): boolean {
  return row.childCount > 0 && children(row).every((cell) => cell.type.name === 'table_header');
}

function headerRows(table: ProseMirrorNode): ProseMirrorNode[] {
  const rows = children(table);
  const count = rows.findIndex((row) => !isHeaderRow(row));
  return rows.slice(0, count < 0 ? rows.length : count);
}

// A table's continuation may repeat its header rows; the whole table keeps them once.
function joinTables(tr: Transform, pos: number) {
  const $pos = tr.doc.resolve(pos);
  const { nodeBefore: previous, nodeAfter: next } = $pos;
  if (!previous || !next) return;
  const header = headerRows(previous);
  const rows = children(next);
  const repeats =
    header.length > 0 && header.every((row, index) => rows[index] && row.eq(rows[index]));
  tr.join(pos);
  if (!repeats) return;
  const size = header.reduce((sum, row) => sum + row.nodeSize, 0);
  tr.delete(pos - 1, pos - 1 + size);
}

// A code block splits at a line break and drops it, so joining puts it back.
function joinCodeBlocks(tr: Transform, pos: number) {
  tr.insert(pos - 1, tr.doc.type.schema.text('\n'));
  tr.join(pos + 1);
}

function joinLinkedCode(tr: Transform, pos: number) {
  const { nodeBefore: previous, nodeAfter: next } = tr.doc.resolve(pos);
  if (!previous || !next) return;
  const code = `${String(previous.attrs.code ?? '')}\n${String(next.attrs.code ?? '')}`;
  tr.delete(pos, pos + next.nodeSize);
  tr.setNodeAttribute(pos - previous.nodeSize, 'code', code);
}

function dropContinuation(tr: Transform, pos: number) {
  const next = tr.doc.nodeAt(pos);
  if (next) tr.delete(pos, pos + next.nodeSize);
}

function sameContentsSettings(previous: ProseMirrorNode, next: ProseMirrorNode): boolean {
  return ['tocType', 'minLevel', 'refFilter'].every(
    (name) => (previous.attrs[name] ?? null) === (next.attrs[name] ?? null),
  );
}

/** The fragment rules of the document schema's splittable types. */
export const FRAGMENT_RULES: FragmentRules = Object.freeze({
  paragraph: { whole: { ...PART, continuationPlaceholder: false } },
  code_block: {
    whole: { ...PART, codeBlockContinued: false, codeLineStart: 1 },
    join: joinCodeBlocks,
  },
  linked_code_block: { whole: { ...PART, codeBlockContinued: false }, join: joinLinkedCode },
  table: { whole: PART, join: joinTables },
  blockquote: { whole: PART, join: joinContainers },
  script_block: { whole: PART, join: joinContainers },
  layout_section: { whole: PART, join: joinLayoutSections },
  bullet_list: { whole: PART, join: joinContainers },
  ordered_list: { whole: PART, join: joinContainers },
  list_item: { whole: { ...PART, orphanedListContinuation: false }, join: joinListItems },
  toc_block: {
    whole: { entryStart: 0, entryEnd: null, showTitle: true },
    continues: sameContentsSettings,
    join: dropContinuation,
  },
});
