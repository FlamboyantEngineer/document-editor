// Merging a document saved by someone else into the reader's changes (D28): a three-way merge by
// element id against the revision the reader edited from. A block only one side changed takes that
// side's version; a container both sides changed, such as a list or a table, merges its children
// the same way; a block both sides changed differently is a conflict for the reader to settle.

import type { DocumentFile, StoredNode, StoredSection } from '../model/format/document-format.js';
import { identifyBlocks } from './merge-identity.js';
import { elementIdOf } from './stored-elements.js';
import { sameStored as same } from './stored-equality.js';

/** A block both sides changed differently, or one side changed and the other deleted. */
export interface MergeConflict {
  /** The block's element id. */
  readonly id: string;
  /** The reader's version, or null when the reader deleted it. */
  readonly mine: StoredNode | null;
  /** The stored version, or null when the other writer deleted it. */
  readonly theirs: StoredNode | null;
}

/** A merged document, with its conflicts showing the reader's version, or the edited one. */
export interface DocumentMerge {
  readonly content: DocumentFile;
  readonly conflicts: readonly MergeConflict[];
}

/** The three versions a merge reads. */
export interface MergeInput {
  /** The stored version the reader edited from. */
  readonly base: DocumentFile;
  /** The reader's version. */
  readonly mine: DocumentFile;
  /** The version stored now. */
  readonly theirs: DocumentFile;
  /** Makes the id of a block that has none in any version; a random one by default. */
  readonly newId?: (() => string) | undefined;
}

// An element and its children as a merge reads them; a section is one too.
interface Element {
  readonly key: string;
  readonly own: unknown;
  readonly children: readonly StoredNode[] | null;
  readonly value: StoredNode | StoredSection;
  /** A section's settings never conflict: the reader's win when both changed them. */
  readonly section: boolean;
}

type Merged = StoredNode | StoredSection;

// Children merge one by one when each is an element with an id; otherwise the node is one block.
function mergeableChildren(node: StoredNode): readonly StoredNode[] | null {
  const { content } = node;
  if (!content?.length || node.type === 'footnote') return null;
  return content.every((child) => child.type !== 'text' && elementIdOf(child)) ? content : null;
}

function nodeElement(node: StoredNode): Element {
  const children = mergeableChildren(node);
  const { content: _content, ...own } = node;
  const key = elementIdOf(node) ?? '';
  return { key, own: children ? own : node, children, value: node, section: false };
}

function sectionElement(section: StoredSection, index: number): Element {
  const { content, ...own } = section;
  const key = section.id ?? `#${String(index)}`;
  return { key, own, children: content, value: section, section: true };
}

// The keys `one` holds in an order `base` does not: a block moved.
function reordered(base: readonly string[], one: readonly string[]): boolean {
  const kept = new Set(one);
  const common = base.filter((key) => kept.has(key));
  const inBase = new Set(base);
  return !same(
    common,
    one.filter((key) => inBase.has(key)),
  );
}

// The merged order: the side that moved blocks gives the order, the reader's when both or neither
// did; each kept block the other side places is put after the block before it on that side.
function mergeOrder(
  keys: { base: string[]; mine: string[]; theirs: string[] },
  kept: ReadonlySet<string>,
): string[] {
  const theirsLead = reordered(keys.base, keys.theirs) && !reordered(keys.base, keys.mine);
  const [lead, other] = theirsLead ? [keys.theirs, keys.mine] : [keys.mine, keys.theirs];
  const order = lead.filter((key) => kept.has(key));
  let after = -1;
  for (const key of other) {
    const at = order.indexOf(key);
    if (at >= 0) after = at;
    else if (kept.has(key)) {
      order.splice(after + 1, 0, key);
      after += 1;
    }
  }
  return order;
}

interface MergeContext {
  conflicts: MergeConflict[];
}

// An element one side no longer holds: gone when the side that holds it left it as it was, kept
// when it is new, and a conflict when one side deleted it and the other changed it.
function mergeOneSided(
  { base, mine, theirs }: { base: Element | null; mine: Element | null; theirs: Element | null },
  context: MergeContext,
): Merged | null {
  const kept = mine ?? theirs;
  if (!kept || (base && same(base.value, kept.value))) return null;
  if (!base) return kept.value;
  context.conflicts.push({
    id: kept.key,
    mine: (mine?.value as StoredNode | undefined) ?? null,
    theirs: (theirs?.value as StoredNode | undefined) ?? null,
  });
  return kept.value;
}

// An element both sides changed: a container merges its own settings and its children; anything
// else, or a container whose own settings both changed, conflicts.
function mergeBothChanged(
  { base, mine, theirs }: { base: Element | null; mine: Element; theirs: Element },
  context: MergeContext,
): Merged {
  const own = mergeOwn(base?.own, mine.own, theirs.own) ?? (mine.section ? mine.own : undefined);
  if (own !== undefined && mine.children && theirs.children) {
    const children = mergeChildren(
      { base: base?.children ?? [], mine: mine.children, theirs: theirs.children },
      context,
    );
    return { ...(own as object), content: children } as Merged;
  }
  context.conflicts.push({
    id: mine.key,
    mine: mine.value as StoredNode,
    theirs: theirs.value as StoredNode,
  });
  return mine.value;
}

// One element's three versions: the one side that changed it wins, and both changed alike agree.
function mergeElement(
  versions: { base: Element | null; mine: Element | null; theirs: Element | null },
  context: MergeContext,
): Merged | null {
  const { base, mine, theirs } = versions;
  if (!mine || !theirs) return mergeOneSided(versions, context);
  if (same(mine.value, theirs.value)) return mine.value;
  if (base && same(base.value, theirs.value)) return mine.value;
  if (base && same(base.value, mine.value)) return theirs.value;
  return mergeBothChanged({ base, mine, theirs }, context);
}

// An element's own settings, three ways; undefined when both sides changed them differently.
function mergeOwn(base: unknown, mine: unknown, theirs: unknown): unknown {
  if (same(mine, theirs) || same(base, theirs)) return mine;
  return same(base, mine) ? theirs : undefined;
}

function mergeChildren(
  lists: {
    base: readonly StoredNode[];
    mine: readonly StoredNode[];
    theirs: readonly StoredNode[];
  },
  context: MergeContext,
): StoredNode[] {
  const read = (nodes: readonly StoredNode[]) => nodes.map(nodeElement);
  const merged = mergeElements(
    { base: read(lists.base), mine: read(lists.mine), theirs: read(lists.theirs) },
    context,
  );
  return merged as StoredNode[];
}

function mergeElements(
  lists: { base: Element[]; mine: Element[]; theirs: Element[] },
  context: MergeContext,
): Merged[] {
  const byKey = (elements: Element[]) => new Map(elements.map((each) => [each.key, each]));
  const maps = { base: byKey(lists.base), mine: byKey(lists.mine), theirs: byKey(lists.theirs) };
  const keys = {
    base: lists.base.map((each) => each.key),
    mine: lists.mine.map((each) => each.key),
    theirs: lists.theirs.map((each) => each.key),
  };
  const results = new Map<string, Merged>();
  for (const key of new Set([...keys.base, ...keys.mine, ...keys.theirs])) {
    const result = mergeElement(
      {
        base: maps.base.get(key) ?? null,
        mine: maps.mine.get(key) ?? null,
        theirs: maps.theirs.get(key) ?? null,
      },
      context,
    );
    if (result) results.set(key, result);
  }
  return mergeOrder(keys, new Set(results.keys())).flatMap((key) => results.get(key) ?? []);
}

/**
 * Merges the reader's changes and the stored ones, both made from `base`, by element id (DOCE-
 * SESSION-4.1). A block both changed differently, or one changed and the other deleted, is a
 * conflict: the merged content shows the reader's version, or the changed one over a deletion.
 * The template pin merges the same way, the reader's winning when both changed it. Blocks without
 * an id are given one first, shared by the versions that hold the same block (`identifyBlocks`).
 */
export function mergeDocuments(input: MergeInput): DocumentMerge {
  const { base, mine, theirs } = identifyBlocks(input);
  const context: MergeContext = { conflicts: [] };
  const read = (file: DocumentFile) => file.sections.map(sectionElement);
  const sections = mergeElements(
    { base: read(base), mine: read(mine), theirs: read(theirs) },
    context,
  ) as StoredSection[];
  const template = same(base.template ?? null, mine.template ?? null)
    ? (theirs.template ?? null)
    : (mine.template ?? null);
  const content: DocumentFile = {
    formatVersion: mine.formatVersion,
    ...(template ? { template } : {}),
    sections,
  };
  return { content, conflicts: context.conflicts };
}
