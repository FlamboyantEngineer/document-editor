// Comparing two versions of a document block by block. Blocks are matched by their element id, so
// a block keeps its identity through edits and moves; the parts of a block split across pages are
// one block. Comments are left out, and so are suggestions: a block's text is its text with every
// suggestion rejected, and the blocks a suggestion inserts are not compared, or, when asked, with
// every suggestion accepted.

import type { Node as ProseMirrorNode, ResolvedPos } from 'prosemirror-model';
import { regionKind } from '../model/index.js';
import { commonSubsequence } from './common-subsequence.js';
import { diffText, type TextSegment } from './text-diff.js';
import {
  type CompareSuggestions,
  containersOf,
  readVersionBlock,
  type VersionBlockReading,
} from './version-blocks.js';
import { pairBlocksWithoutIds } from './version-pairing.js';

export type { CompareSuggestions } from './version-blocks.js';

/** How a block changed between two versions. */
export type VersionChangeKind = 'insertion' | 'deletion' | 'modification' | 'formatting' | 'move';

/** A target a block's runs point to: a link's address, or what a reference cites. */
export type VersionChangeTarget = 'link' | 'reference';

/** One block's change, placed in the newer version. */
export interface VersionChange {
  readonly kind: VersionChangeKind;
  /** The block's element id, if it has one. */
  readonly id: string | null;
  /**
   * The block's parts in the newer version. A deleted block has none; it is placed before the
   * block in `at`, or after it when it was the last.
   */
  readonly parts: readonly { readonly from: number; readonly to: number }[];
  /** For a deletion: the newer version's block it was before, or after when `after` is true. */
  readonly at: { readonly from: number; readonly to: number; readonly after: boolean } | null;
  /** The block's text in the newer version, or the deleted block's text. */
  readonly text: string;
  /** The block's text in the older version, for a block both versions hold. */
  readonly previousText: string | null;
  /** What the text kept, inserted and deleted, for a block whose text changed. */
  readonly segments: readonly TextSegment[];
  /** Each character of `text`'s position in the newer version; none for a deletion. */
  readonly positions: readonly number[];
  /** For a modification: whether its formatting or its containers changed too. */
  readonly formatChanged?: boolean | undefined;
  /** For a block both versions hold: whether the containers it sits in changed. */
  readonly structureChanged?: boolean | undefined;
  /** For a block both versions hold: the kinds of target whose address changed. */
  readonly targets?: readonly VersionChangeTarget[] | undefined;
  /** For a modification: whether only values the document generates changed. */
  readonly generated?: boolean | undefined;
}

/** A block of a version: its identity, its parts, how it reads and the containers it sits in. */
export interface VersionBlock extends VersionBlockReading {
  key: string;
  readonly id: string | null;
  /** Its node type's name. */
  readonly type: string;
  readonly parts: { from: number; to: number }[];
  text: string;
  readonly positions: number[];
  authored: string;
  generated: string;
  /** Its containers, outermost first, by kind and attributes. */
  readonly container: string;
}

/** An older version read once, so newer versions are compared with it without reading it again. */
export interface OlderVersion {
  readonly doc: ProseMirrorNode;
  /** How it was read, and how versions are compared with it. */
  readonly options: CompareOptions;
  readonly blocks: readonly VersionBlock[];
  readonly byKey: ReadonlyMap<string, VersionBlock>;
}

/** How two versions are compared. */
export interface CompareOptions {
  /** How the versions' suggestions count. Defaults to rejected. */
  readonly suggestions?: CompareSuggestions | undefined;
  /**
   * Whether a block whose only change is in values the document generates counts as modified.
   * Defaults to false.
   */
  readonly generated?: boolean | undefined;
}

// The regions drawn around the document's content, which no version holds.
const isPageChrome = (node: ProseMirrorNode) => {
  const kind = regionKind(node);
  return kind !== null && kind !== 'content';
};

// A block's formatting without its runs' lengths, which change with its text.
const withoutLengths = (format: string) => format.replace(/\|\d+:/g, '|');

// A later part of a split block: its text and positions join the first part's.
function joinPart(
  block: VersionBlock,
  read: VersionBlockReading,
  part: { from: number; to: number },
) {
  block.parts.push(part);
  block.text += read.text;
  block.authored += read.authored;
  block.generated += read.generated;
  block.positions.push(...read.positions);
}

/**
 * A version's blocks in reading order: text blocks and leaf blocks, split parts joined, with their
 * suggestions rejected unless they are to count as accepted.
 */
export function collectVersionBlocks(
  doc: ProseMirrorNode,
  suggestions: CompareSuggestions = 'rejected',
): VersionBlock[] {
  const blocks: VersionBlock[] = [];
  const seen = new Map<string, number>();
  doc.descendants((node, pos) => {
    if (isPageChrome(node)) return false;
    if (!node.isBlock || !(node.isTextblock || node.isAtom)) return true;
    if (suggestions === 'rejected' && node.attrs.suggestionSplitKind === 'insertion') return false;
    const id = typeof node.attrs.dataId === 'string' ? node.attrs.dataId : null;
    const { container, generated } = containersOf(doc.resolve(pos));
    const read = readVersionBlock(node, { pos, suggestions, generated });
    const part = { from: pos, to: pos + node.nodeSize };
    const last = blocks.at(-1);
    if (id && last?.id === id && node.attrs.splitPartIndex !== null) {
      joinPart(last, read, part);
      return false;
    }
    const base = id ?? `#${withoutLengths(read.format)}#${read.authored}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    const key = count ? `${base}#${String(count)}` : base;
    blocks.push({ ...read, key, id, type: node.type.name, parts: [part], container });
    return false;
  });
  return blocks;
}

// The keys both versions hold that keep their order: a longest common subsequence.
function keptInOrder(older: readonly string[], newer: readonly string[]): Set<string> {
  return new Set(commonSubsequence(older, newer).map(([index]) => older[index] ?? ''));
}

// The kinds of target whose address changed between a block's versions.
function changedTargets(newer: VersionBlock, older: VersionBlock): VersionChangeTarget[] {
  const targets: VersionChangeTarget[] = [];
  if (newer.links !== older.links) targets.push('link');
  if (newer.references !== older.references) targets.push('reference');
  return targets;
}

// How a block both versions hold changed: moved; its own text or a target changed; its formatting
// or containers changed; or, when asked, only what the document generates in it changed.
function kindOf(
  facts: { moved: boolean; edited: boolean; formatted: boolean; generated: boolean },
  options: CompareOptions,
): VersionChangeKind | null {
  if (facts.moved) return 'move';
  if (facts.edited) return 'modification';
  if (facts.formatted) return 'formatting';
  return facts.generated && options.generated ? 'modification' : null;
}

function changeOf(
  newer: VersionBlock,
  older: VersionBlock,
  { moved, options }: { moved: boolean; options: CompareOptions },
): VersionChange | null {
  const textChanged = newer.text !== older.text;
  const targets = changedTargets(newer, older);
  const structureChanged = newer.container !== older.container;
  const formatChanged =
    structureChanged || withoutLengths(newer.format) !== withoutLengths(older.format);
  const edited = newer.authored !== older.authored || targets.length > 0;
  const generated = textChanged || newer.generated !== older.generated;
  // Without a text change, runs that changed length were formatted apart or together.
  const formatted = formatChanged || (!textChanged && newer.format !== older.format);
  const kind = kindOf({ moved, edited, formatted, generated }, options);
  if (!kind) return null;
  return {
    kind,
    id: newer.id,
    parts: newer.parts,
    at: null,
    text: newer.text,
    previousText: older.text,
    segments: textChanged ? diffText(older.text, newer.text) : [],
    positions: newer.positions,
    formatChanged: kind === 'modification' && formatChanged,
    structureChanged,
    targets,
    generated: kind === 'modification' && !edited,
  };
}

// Where a deleted block goes: before the next block the newer version still holds, else at its end.
function deletionsOf(
  older: readonly VersionBlock[],
  newerByKey: ReadonlyMap<string, VersionBlock>,
  last: VersionBlock | undefined,
): VersionChange[] {
  const changes: VersionChange[] = [];
  let pending: VersionBlock[] = [];
  const place = (at: VersionChange['at']) => {
    for (const block of pending) {
      changes.push({
        kind: 'deletion',
        id: block.id,
        parts: [],
        at,
        text: block.text,
        previousText: block.text,
        segments: [],
        positions: [],
      });
    }
    pending = [];
  };
  for (const block of older) {
    const kept = newerByKey.get(block.key);
    if (!kept) pending.push(block);
    else if (pending.length) place({ ...firstPart(kept), after: false });
  }
  if (pending.length) place(last ? { ...lastPart(last), after: true } : null);
  return changes;
}

const firstPart = (block: VersionBlock) => block.parts[0] ?? { from: 0, to: 0 };
const lastPart = (block: VersionBlock) => block.parts.at(-1) ?? { from: 0, to: 0 };

const insertionOf = (block: VersionBlock): VersionChange => ({
  kind: 'insertion',
  id: block.id,
  parts: block.parts,
  at: null,
  text: block.text,
  previousText: null,
  segments: [],
  positions: block.positions,
});

/** Reads an older version's blocks, to compare newer versions with it (`compareWithOlder`). */
export function readOlderVersion(doc: ProseMirrorNode, options: CompareOptions = {}): OlderVersion {
  const blocks = collectVersionBlocks(doc, options.suggestions);
  return { doc, options, blocks, byKey: new Map(blocks.map((block) => [block.key, block])) };
}

// Whether a text block compares by its element id alone: whole, not a block a suggestion inserts,
// and neither inside a block read as one nor in the regions drawn around the content.
function comparesAlone(node: ProseMirrorNode, $pos: ResolvedPos): boolean {
  const { dataId, splitPartIndex, suggestionSplitKind } = node.attrs;
  if (typeof dataId !== 'string' || !node.isTextblock) return false;
  if ((splitPartIndex ?? null) !== null || (suggestionSplitKind ?? null) !== null) return false;
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const outer = $pos.node(depth);
    if (outer.isAtom || isPageChrome(outer)) return false;
  }
  return true;
}

/**
 * How the text block at a position changed from an older version, compared alone, after a change
 * that only typed in it: `shown` is the change the block showed before, which says whether it
 * moved or was inserted, as typing changes neither. Null for a block that reads as it did;
 * undefined for a block that cannot be compared alone, such as one without an element id or a part
 * of a split block, whose versions are compared whole.
 */
export function compareBlockWithOlder(
  older: OlderVersion,
  newer: ProseMirrorNode,
  { pos, shown }: { pos: number; shown: VersionChange | undefined },
): VersionChange | null | undefined {
  const node = newer.nodeAt(pos);
  const $pos = newer.resolve(pos);
  if (!node || !comparesAlone(node, $pos)) return undefined;
  const id = String(node.attrs.dataId);
  const { container, generated } = containersOf($pos);
  const suggestions = older.options.suggestions ?? 'rejected';
  const read = readVersionBlock(node, { pos, suggestions, generated });
  const parts = [{ from: pos, to: pos + node.nodeSize }];
  const block = { ...read, key: id, id, type: node.type.name, parts, container };
  if (shown?.kind === 'insertion') return insertionOf(block);
  const previous = older.byKey.get(id);
  if (!previous) return undefined;
  return changeOf(block, previous, { moved: shown?.kind === 'move', options: older.options });
}

/** Where a change is among a version's changes: a deletion comes before the block it is placed at. */
export const placeOfVersionChange = (change: VersionChange): number =>
  change.parts[0]?.from ?? (change.at ? change.at.from - (change.at.after ? -0.5 : 0.5) : 0);

/**
 * The changes from an older version of a document to a newer one, in the newer one's order:
 * blocks inserted, deleted, moved, with changed text or targets, or with changed formatting or
 * containers only. Blocks without element ids that are alike enough compare as one block. Both
 * versions' suggestions count as rejected, or as accepted when asked.
 */
export function compareVersions(
  older: ProseMirrorNode,
  newer: ProseMirrorNode,
  options: CompareOptions = {},
): VersionChange[] {
  return compareWithOlder(readOlderVersion(older, options), newer);
}

/**
 * The changes from an older version read before (`readOlderVersion`) to a newer one, as
 * `compareVersions` gives them with the options the older version was read with.
 */
export function compareWithOlder(older: OlderVersion, newer: ProseMirrorNode): VersionChange[] {
  const { options } = older;
  const before = older.blocks;
  const after = collectVersionBlocks(newer, options.suggestions);
  pairBlocksWithoutIds(before, after);
  const olderByKey = older.byKey;
  const newerByKey = new Map(after.map((block) => [block.key, block]));
  const kept = keptInOrder(
    before.filter((block) => newerByKey.has(block.key)).map((block) => block.key),
    after.filter((block) => olderByKey.has(block.key)).map((block) => block.key),
  );
  const changes: VersionChange[] = [];
  for (const block of after) {
    const previous = olderByKey.get(block.key);
    const change = previous
      ? changeOf(block, previous, { moved: !kept.has(block.key), options })
      : insertionOf(block);
    if (change) changes.push(change);
  }
  changes.push(...deletionsOf(before, newerByKey, after.at(-1)));
  return changes.sort((a, b) => placeOfVersionChange(a) - placeOfVersionChange(b));
}
