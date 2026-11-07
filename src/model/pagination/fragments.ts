// A block that does not fit on a page is split into fragments, one per page, each a node of the
// block's own type marked as a part. Joining puts the fragments back into one whole block, so the
// stored document and the editing document never hold pages' parts. Each splittable type has a rule.

import { Fragment, type Node as ProseMirrorNode } from 'prosemirror-model';

type Attrs = Record<string, unknown>;

/** What two fragments become when joined: their content, and any attributes that change. */
export interface JoinedFragment {
  attrs?: Attrs | undefined;
  content: Fragment | readonly ProseMirrorNode[] | null;
}

/** How one node type's fragments are recognised and joined. */
export interface FragmentRule {
  /** The attribute values of a whole block; a node holding any other value is a fragment. */
  readonly whole: Readonly<Attrs>;
  /** Whether `next` continues `previous`; by default, both are the same split element. */
  continues?: (previous: ProseMirrorNode, next: ProseMirrorNode) => boolean;
  /** The two fragments as one; by default, their content in order. */
  join?: (previous: ProseMirrorNode, next: ProseMirrorNode, rules: FragmentRules) => JoinedFragment;
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

/** A node as a whole block: itself when it is not a fragment. */
export function wholeNode(node: ProseMirrorNode, rules: FragmentRules = FRAGMENT_RULES) {
  const rule = ruleFor(rules, node.type.name);
  if (!rule || !isFragment(node, rules)) return node;
  return node.type.create({ ...node.attrs, ...rule.whole }, node.content, node.marks);
}

function joinTwo(previous: ProseMirrorNode, next: ProseMirrorNode, rules: FragmentRules) {
  const rule = ruleFor(rules, previous.type.name);
  const joined = rule?.join
    ? rule.join(previous, next, rules)
    : { content: previous.content.append(next.content) };
  const content = joined.content === null ? null : Fragment.from(joined.content);
  return previous.type.create(
    { ...previous.attrs, ...joined.attrs, ...rule?.whole },
    content,
    previous.marks,
  );
}

/**
 * Blocks in order with every run of fragments joined into its whole block; a fragment whose other
 * parts are missing becomes whole on its own.
 */
export function joinFragments(
  blocks: readonly ProseMirrorNode[],
  rules: FragmentRules = FRAGMENT_RULES,
): ProseMirrorNode[] {
  const joined: ProseMirrorNode[] = [];
  let previous: ProseMirrorNode | undefined;
  for (const block of blocks) {
    const last = joined.at(-1);
    if (last && previous && continuesFragment(previous, block, rules)) {
      joined[joined.length - 1] = joinTwo(last, block, rules);
    } else {
      joined.push(wholeNode(block, rules));
    }
    previous = block;
  }
  return joined;
}

function children(node: ProseMirrorNode): ProseMirrorNode[] {
  const nodes: ProseMirrorNode[] = [];
  node.forEach((child) => nodes.push(child));
  return nodes;
}

/** Two containers' children in order, the child split across them joined. */
export function joinChildren(
  previous: readonly ProseMirrorNode[],
  next: readonly ProseMirrorNode[],
  rules: FragmentRules,
): ProseMirrorNode[] {
  const last = previous.at(-1);
  const [first, ...rest] = next;
  if (!last || !first || !continuesFragment(last, first, rules)) return [...previous, ...next];
  return [...previous.slice(0, -1), joinTwo(last, first, rules), ...rest];
}

// The empty paragraph a list item's continuation opens with when its split falls between children.
function isContinuationPlaceholder(node: ProseMirrorNode | undefined): boolean {
  return node?.type.name === 'paragraph' && node.content.size === 0 && !node.attrs.dataId;
}

function joinListItems(previous: ProseMirrorNode, next: ProseMirrorNode, rules: FragmentRules) {
  const nextChildren = children(next);
  if (isContinuationPlaceholder(nextChildren[0])) nextChildren.shift();
  return { content: joinChildren(children(previous), nextChildren, rules) };
}

function joinContainers(previous: ProseMirrorNode, next: ProseMirrorNode, rules: FragmentRules) {
  return { content: joinChildren(children(previous), children(next), rules) };
}

function isHeaderRow(row: ProseMirrorNode): boolean {
  return row.childCount > 0 && children(row).every((cell) => cell.type.name === 'table_header');
}

function splitHeaderRows(table: ProseMirrorNode) {
  const rows = children(table);
  const count = rows.findIndex((row) => !isHeaderRow(row));
  const headerCount = count < 0 ? rows.length : count;
  return { header: rows.slice(0, headerCount), body: rows.slice(headerCount) };
}

// A table's continuation may repeat its header rows; the whole table keeps them once.
function joinTables(previous: ProseMirrorNode, next: ProseMirrorNode) {
  const { header } = splitHeaderRows(previous);
  const rows = children(next);
  const repeats =
    header.length > 0 && header.every((row, index) => rows[index] && row.eq(rows[index]));
  return { content: [...children(previous), ...(repeats ? rows.slice(header.length) : rows)] };
}

// A code block splits at a line break and drops it, so joining puts it back.
function joinCodeBlocks(previous: ProseMirrorNode, next: ProseMirrorNode) {
  const lineBreak = previous.type.schema.text('\n');
  return { content: previous.content.append(Fragment.from(lineBreak)).append(next.content) };
}

function joinLinkedCode(previous: ProseMirrorNode, next: ProseMirrorNode) {
  const code = `${String(previous.attrs.code ?? '')}\n${String(next.attrs.code ?? '')}`;
  return { attrs: { code }, content: null };
}

function sameContentsSettings(previous: ProseMirrorNode, next: ProseMirrorNode): boolean {
  return ['tocType', 'minLevel', 'refFilter'].every(
    (name) => (previous.attrs[name] ?? null) === (next.attrs[name] ?? null),
  );
}

/** The fragment rules of the document schema's splittable types. */
export const FRAGMENT_RULES: FragmentRules = Object.freeze({
  paragraph: { whole: PART },
  code_block: {
    whole: { ...PART, codeBlockContinued: false, codeLineStart: 1 },
    join: joinCodeBlocks,
  },
  linked_code_block: { whole: { ...PART, codeBlockContinued: false }, join: joinLinkedCode },
  table: { whole: PART, join: joinTables },
  blockquote: { whole: PART, join: joinContainers },
  bullet_list: { whole: PART, join: joinContainers },
  ordered_list: { whole: PART, join: joinContainers },
  list_item: { whole: { ...PART, orphanedListContinuation: false }, join: joinListItems },
  toc_block: {
    whole: { entryStart: 0, entryEnd: null, showTitle: true },
    continues: sameContentsSettings,
    join: () => ({ content: null }),
  },
});
