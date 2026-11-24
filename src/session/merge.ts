// Merging a document saved by someone else into the reader's changes (D28): a three-way merge by
// element id against the revision the reader edited from. A block only one side changed takes that
// side's version; a container both sides changed, such as a list or a table, merges its children
// the same way; a block both sides changed differently is a conflict for the reader to settle.

import type { DocumentFile, StoredNode, StoredSection } from '../model/format/document-format.js';
import { withMergedChildren } from './merge-children.js';
import { identifyBlocks } from './merge-identity.js';
import { mergeOrder } from './merge-order.js';
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

// A section is found in each version by its id, or by its place when it has none.
const sectionKey = (section: StoredSection, index: number) => section.id ?? `#${String(index)}`;

function sectionElement(section: StoredSection, index: number): Element {
  const { content, ...own } = section;
  return { key: sectionKey(section, index), own, children: content, value: section, section: true };
}

// Where a version holds an element: the element, and the key of the container it is in.
interface Place {
  readonly node: StoredNode;
  readonly parent: string;
}

type Places = ReadonlyMap<string, Place>;

interface MergeContext {
  conflicts: MergeConflict[];
  /** Each version's elements by id, to find a block a side moved to another container. */
  places: { base: Places; mine: Places; theirs: Places };
}

// Every element a merge reads by id in a version, with its container: a section, or a node whose
// children merge one by one.
function placesOf(file: DocumentFile): Places {
  const places = new Map<string, Place>();
  const walk = (nodes: readonly StoredNode[], parent: string) => {
    for (const node of nodes) {
      const id = elementIdOf(node);
      if (id === null) continue;
      places.set(id, { node, parent });
      walk(mergeableChildren(node) ?? [], id);
    }
  };
  file.sections.forEach((section, index) => walk(section.content, sectionKey(section, index)));
  return places;
}

type MovingSide = 'mine' | 'theirs';

// The reader's destination wins when both sides moved the element.
function movedBy(key: string, { places }: MergeContext): MovingSide | undefined {
  const parent = places.base.get(key)?.parent;
  if (parent === undefined) return undefined;
  return (['mine', 'theirs'] as const).find((side) => {
    const place = places[side].get(key);
    return place && place.parent !== parent;
  });
}

// Conflict alternatives keep their own subtree, with any independently relocated child
// omitted so selecting a conflicting version cannot bring back a second copy.
function withoutMoved(element: Element, context: MergeContext): Merged | null {
  if (!element.children) return element.value;
  const children: StoredNode[] = [];
  for (const child of element.children) {
    const key = elementIdOf(child) ?? '';
    const side = movedBy(key, context);
    if (side && context.places[side].get(key)?.parent !== element.key) continue;
    const kept = withoutMoved(nodeElement(child), context);
    if (kept) children.push(kept as StoredNode);
  }
  return withMergedChildren(element.value, children);
}

function mergeRetained(kept: Element, side: MovingSide, context: MergeContext): Merged | null {
  if (!kept.children) return kept.value;
  const lists = { base: [], mine: [], theirs: [], [side]: kept.children };
  return withMergedChildren(kept.value, mergeChildren(lists, context));
}

// An element one side no longer holds: gone when the side that holds it left it as it was, kept
// when it is new, and a conflict when one side deleted it and the other changed it.
function mergeOneSided({ base, mine, theirs }: Versions, context: MergeContext): Merged | null {
  const kept = mine ?? theirs;
  if (!kept) return null;
  if (base && same(withoutMoved(base, context), withoutMoved(kept, context))) return null;
  const value = mergeRetained(kept, mine ? 'mine' : 'theirs', context);
  if (base && value) {
    context.conflicts.push({
      id: kept.key,
      mine: mine ? (value as StoredNode) : null,
      theirs: theirs ? (value as StoredNode) : null,
    });
  }
  return value;
}

// An element both sides changed: a container merges its settings and children. Competing
// settings on a block are a conflict, without putting a moved child back in its old container.
function mergeBothChanged(
  { base, mine, theirs }: { base: Element | null; mine: Element; theirs: Element },
  context: MergeContext,
): Merged | null {
  const own = mergeOwn(base?.own, mine.own, theirs.own) ?? (mine.section ? mine.own : undefined);
  if (own !== undefined && mine.children && theirs.children) {
    const children = mergeChildren(
      { base: base?.children ?? [], mine: mine.children, theirs: theirs.children },
      context,
    );
    return withMergedChildren(own as Merged, children);
  }
  const kept = withoutMoved(mine, context);
  const other = withoutMoved(theirs, context);
  if (kept || other) {
    context.conflicts.push({ id: mine.key, mine: kept as StoredNode, theirs: other as StoredNode });
  }
  return kept ?? other;
}

// The three versions of one element, null where a version does not hold it.
interface Versions {
  base: Element | null;
  mine: Element | null;
  theirs: Element | null;
}

// The versions to merge for an element of one container. A block a side moved to another
// container is merged once, where that side put it, the reader's place when both moved it, from
// its versions wherever each holds them; in any other container it is left out. Read container by
// container it would be deleted in one and new in the other, and kept in both once the other side
// changed it. A block the other side holds no more stays where it was moved, as a new block does.
function versionsAt(here: Versions, key: string, context: MergeContext): Versions | null {
  const { places } = context;
  const isSection = [here.base, here.mine, here.theirs].some((each) => each?.section);
  if (isSection) return here;
  const mover = movedBy(key, context);
  if (!mover) return here;
  if (!here[mover]) return null;
  if (!places[mover === 'mine' ? 'theirs' : 'mine'].has(key)) return here;
  const held = (side: keyof Versions) => {
    const place = places[side].get(key);
    return place ? nodeElement(place.node) : null;
  };
  return { base: held('base'), mine: held('mine'), theirs: held('theirs') };
}

// One element's three versions: the one side that changed it wins, and both changed alike agree.
function mergeElement(versions: Versions, context: MergeContext): Merged | null {
  const { base, mine, theirs } = versions;
  if (!mine || !theirs) return mergeOneSided(versions, context);
  if (same(mine.value, theirs.value)) return mine.value;
  // A container merges child by child even when one side left it as it was: a block the other
  // side moved into it brings along what the first changed in it, in its old container.
  if (mine.children && theirs.children) return mergeBothChanged({ base, mine, theirs }, context);
  if (base && same(base.value, theirs.value)) return mergeRetained(mine, 'mine', context);
  if (base && same(base.value, mine.value)) return mergeRetained(theirs, 'theirs', context);
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
    const here = {
      base: maps.base.get(key) ?? null,
      mine: maps.mine.get(key) ?? null,
      theirs: maps.theirs.get(key) ?? null,
    };
    const versions = versionsAt(here, key, context);
    const result = versions && mergeElement(versions, context);
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
  const context: MergeContext = {
    conflicts: [],
    places: { base: placesOf(base), mine: placesOf(mine), theirs: placesOf(theirs) },
  };
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
