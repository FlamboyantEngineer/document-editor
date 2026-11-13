// Giving the blocks of a merge's three versions one identity where they have none of their own. A
// document stored without element ids gets them from each editor that opens it, different ones in
// each, so read by id alone every block would be removed and added again by both sides, and blocks
// with no id at all would all be one block. The blocks the base holds without an id are paired with
// each side's, by content and then by place, and the versions of one block take one id.

import { createElementId } from '../engine/element-ids.js';
import { cloneJson } from '../model/clone-json.js';
import type { DocumentFile, StoredNode } from '../model/format/document-format.js';
import { storedNodeKey } from './dirty.js';
import { childElements, elementIdKey, elementIdOf } from './stored-elements.js';

/** The three versions a merge reads, and how it makes an id. */
export interface MergeVersions {
  readonly base: DocumentFile;
  readonly mine: DocumentFile;
  readonly theirs: DocumentFile;
  readonly newId?: (() => string) | undefined;
}

// The same list of siblings in the three versions, one side's empty where it does not hold it.
interface Siblings {
  base: readonly StoredNode[];
  mine: readonly StoredNode[];
  theirs: readonly StoredNode[];
}

// What identifying reads throughout: the ids the base holds, and how to make one no version holds.
interface Identifying {
  baseIds: ReadonlySet<string>;
  fresh: () => string;
}

function forEachElement(nodes: readonly StoredNode[], visit: (node: StoredNode) => void): void {
  for (const node of nodes) {
    if (node.type === 'text') continue;
    visit(node);
    forEachElement(childElements(node), visit);
  }
}

const blocksOf = (file: DocumentFile) => file.sections.flatMap((section) => section.content);

function idsOf(file: DocumentFile): Set<string> {
  const ids = new Set<string>();
  forEachElement(blocksOf(file), (node) => {
    const id = elementIdOf(node);
    if (id !== null) ids.add(id);
  });
  return ids;
}

function lacksIds(file: DocumentFile): boolean {
  let lacking = false;
  forEachElement(blocksOf(file), (node) => {
    lacking ||= elementIdOf(node) === null;
  });
  return lacking;
}

// The places where blocks of `base` and of `side` hold the same content, in the order of both.
function matchContent(base: readonly StoredNode[], side: readonly StoredNode[]) {
  const places = new Map<string, number[]>();
  base.forEach((node, index) => {
    const key = storedNodeKey(node);
    const held = places.get(key);
    if (held) held.push(index);
    else places.set(key, [index]);
  });
  const matches: (readonly [number, number])[] = [];
  let last = -1;
  side.forEach((node, index) => {
    const at = places.get(storedNodeKey(node))?.find((place) => place > last);
    if (at === undefined) return;
    last = at;
    matches.push([at, index]);
  });
  return matches;
}

// Pairs blocks of the base with a side's: the ones with the same content, in order, then the ones
// between two such pairs when both hold as many there, which reads as each changed where it was.
// Any other block of the base was removed, and any other of the side added.
function pairBlocks(base: readonly StoredNode[], side: readonly StoredNode[]) {
  const pairs = new Map<StoredNode, StoredNode>();
  const pair = (one: StoredNode | undefined, other: StoredNode | undefined) => {
    if (one && other) pairs.set(one, other);
  };
  let fromBase = 0;
  let fromSide = 0;
  for (const [inBase, inSide] of [
    ...matchContent(base, side),
    [base.length, side.length] as const,
  ]) {
    const between = inBase - fromBase;
    if (between === inSide - fromSide) {
      for (let step = 0; step < between; step += 1)
        pair(base[fromBase + step], side[fromSide + step]);
    }
    pair(base[inBase], side[inSide]);
    fromBase = inBase + 1;
    fromSide = inSide + 1;
  }
  return pairs;
}

// One block's versions take one identity: the stored side's id and writer, since the store keeps
// those, else the reader's, else a new id. An editor names a block's writer when it gives it an
// id, so two editors' names for one block are no change to it.
function shareIdentity(versions: readonly (StoredNode | undefined)[], fresh: () => string): void {
  const [, mine, theirs] = versions;
  const from = [theirs, mine].find((node) => node && elementIdOf(node) !== null);
  const id = from ? elementIdOf(from) : fresh();
  const author: unknown = (from ?? theirs ?? mine)?.attrs?.author;
  for (const node of versions) {
    if (!node) continue;
    const { author: _own, ...attrs } = node.attrs ?? {};
    node.attrs = {
      ...attrs,
      [elementIdKey(node)]: id,
      ...(author === undefined ? {} : { author }),
    };
  }
}

// Gives the blocks the base holds without an id, in one list of siblings and below, the identity
// of the block each side holds in their place. A side's block the base holds elsewhere is that
// block moved, never the pair of another.
function identifySiblings(siblings: Siblings, context: Identifying): void {
  const unknown = siblings.base.filter((node) => elementIdOf(node) === null);
  const free = (side: readonly StoredNode[]) =>
    side.filter((node) => !context.baseIds.has(elementIdOf(node) ?? ''));
  if (unknown.length > 0) {
    const mine = pairBlocks(unknown, free(siblings.mine));
    const theirs = pairBlocks(unknown, free(siblings.theirs));
    for (const block of unknown) {
      shareIdentity([block, mine.get(block), theirs.get(block)], context.fresh);
    }
  }
  const byId = (side: readonly StoredNode[]) =>
    new Map(side.map((node) => [elementIdOf(node), node]));
  const mine = byId(siblings.mine);
  const theirs = byId(siblings.theirs);
  const below = (node: StoredNode | undefined) => (node ? childElements(node) : []);
  for (const block of siblings.base) {
    const id = elementIdOf(block);
    identifySiblings(
      { base: childElements(block), mine: below(mine.get(id)), theirs: below(theirs.get(id)) },
      context,
    );
  }
}

// A section is found in each version by its id, or by its place when it has none.
const sectionsByKey = (file: DocumentFile) =>
  new Map(file.sections.map((section, index) => [section.id ?? `#${String(index)}`, section]));

// Ids no version holds, from `newId`.
function freshIds(versions: MergeVersions, newId: () => string): () => string {
  const taken = new Set([
    ...idsOf(versions.base),
    ...idsOf(versions.mine),
    ...idsOf(versions.theirs),
  ]);
  return () => {
    let id = newId();
    while (taken.has(id)) id = newId();
    taken.add(id);
    return id;
  };
}

/**
 * The versions of a merge with every block identified (DOCE-SESSION-4.1): the versions themselves
 * when each block has an id already, else copies in which the versions of one block share one id.
 * A block of the base without an id is paired with each side's block of the same content, or the
 * one changed in its place; the pair takes the stored side's id, else the reader's, else a new one.
 * A block left without an id, which only one version holds, takes a new one.
 */
export function identifyBlocks(versions: MergeVersions): MergeVersions {
  const { base, mine, theirs } = versions;
  if (![base, mine, theirs].some(lacksIds)) return versions;
  const copy = { base: cloneJson(base), mine: cloneJson(mine), theirs: cloneJson(theirs) };
  const context = {
    baseIds: idsOf(copy.base),
    fresh: freshIds(copy, versions.newId ?? createElementId),
  };
  const sections = { mine: sectionsByKey(copy.mine), theirs: sectionsByKey(copy.theirs) };
  for (const [key, section] of sectionsByKey(copy.base)) {
    const held = (side: 'mine' | 'theirs') =>
      (sections[side].get(key)?.content ?? []).filter((node) => node.type !== 'text');
    identifySiblings(
      { base: section.content, mine: held('mine'), theirs: held('theirs') },
      context,
    );
  }
  for (const file of [copy.base, copy.mine, copy.theirs]) {
    forEachElement(blocksOf(file), (node) => {
      if (elementIdOf(node) !== null) return;
      node.attrs = { ...node.attrs, [elementIdKey(node)]: context.fresh() };
    });
  }
  return copy;
}
