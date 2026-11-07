// Comparing two versions of a document block by block. Blocks are matched by their element id, so
// a block keeps its identity through edits and moves; the parts of a block split across pages are
// one block. Comments and suggestions are left out: a block's text is its text with every
// suggestion rejected, and the blocks a suggestion inserts are not compared.

import type { Mark, Node as ProseMirrorNode } from 'prosemirror-model';
import { commonSubsequence } from './common-subsequence.js';
import { diffText, type TextSegment } from './text-diff.js';

/** How a block changed between two versions. */
export type VersionChangeKind = 'insertion' | 'deletion' | 'modification' | 'formatting' | 'move';

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
}

/** A block of a version: its identity, its parts, its text and how it is formatted. */
export interface VersionBlock {
  readonly key: string;
  readonly id: string | null;
  readonly parts: { from: number; to: number }[];
  text: string;
  /** Each character of `text`'s position in the document. */
  readonly positions: number[];
  format: string;
}

// The attributes that say where a block is or who wrote it, not how it looks.
const VOLATILE_ATTRS = new Set([
  'dataId',
  'dataAuthor',
  'dataAiSession',
  'splitPartIndex',
  'suggestionSplitKind',
  'suggestionSplitId',
  'orphanedListContinuation',
]);

// The marks that record a review rather than formatting.
const REVIEW_MARKS = new Set(['comment_highlight', 'insertion', 'deletion', 'contributor']);

// The blocks drawn around the document's content, which no version holds.
const PAGE_CHROME = new Set(['page_header', 'page_footer', 'page_footnotes']);

function attrsFormat(node: ProseMirrorNode): string {
  const kept = Object.entries(node.attrs).filter(([name]) => !VOLATILE_ATTRS.has(name));
  return `${node.type.name}${JSON.stringify(kept)}`;
}

function marksFormat(marks: readonly Mark[]): string {
  return marks
    .filter((mark) => !REVIEW_MARKS.has(mark.type.name))
    .map((mark) => `${mark.type.name}${JSON.stringify(mark.attrs)}`)
    .join(',');
}

const isSuggestedInsertion = (node: ProseMirrorNode) =>
  node.marks.some((mark) => mark.type.name === 'insertion');

// A text block's or leaf block's text and formatting, from a position. The formatting is the
// block's attributes and its runs of text by their marks, review marks left out.
function readBlock(node: ProseMirrorNode, pos: number) {
  const positions: number[] = [];
  const runs: { format: string; length: number }[] = [];
  let text = '';
  node.forEach((child, offset) => {
    if (isSuggestedInsertion(child)) return;
    const value = child.isText ? (child.text ?? '') : child.isLeaf ? '\uFFFC' : child.textContent;
    const format = marksFormat(child.marks) + (child.isText ? '' : attrsFormat(child));
    const last = runs.at(-1);
    if (last?.format === format) last.length += value.length;
    else runs.push({ format, length: value.length });
    for (let index = 0; index < value.length; index += 1) positions.push(pos + 1 + offset + index);
    text += value;
  });
  const format =
    attrsFormat(node) + runs.map((run) => `|${String(run.length)}:${run.format}`).join('');
  return { text, positions, format };
}

/** A version's blocks in reading order: text blocks and leaf blocks, split parts joined. */
export function collectVersionBlocks(doc: ProseMirrorNode): VersionBlock[] {
  const blocks: VersionBlock[] = [];
  const seen = new Map<string, number>();
  doc.descendants((node, pos) => {
    if (PAGE_CHROME.has(node.type.name)) return false;
    if (!node.isBlock || !(node.isTextblock || node.isAtom)) return true;
    if (node.attrs.suggestionSplitKind === 'insertion') return false;
    const id = typeof node.attrs.dataId === 'string' ? node.attrs.dataId : null;
    const read = readBlock(node, pos);
    const last = blocks.at(-1);
    if (id && last?.id === id && node.attrs.splitPartIndex !== null) {
      last.parts.push({ from: pos, to: pos + node.nodeSize });
      last.text += read.text;
      last.positions.push(...read.positions);
      return false;
    }
    const base = id ?? `#${read.format}#${read.text}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    blocks.push({
      key: count ? `${base}#${String(count)}` : base,
      id,
      parts: [{ from: pos, to: pos + node.nodeSize }],
      ...read,
    });
    return false;
  });
  return blocks;
}

// The keys both versions hold that keep their order: a longest common subsequence.
function keptInOrder(older: readonly string[], newer: readonly string[]): Set<string> {
  return new Set(commonSubsequence(older, newer).map(([index]) => older[index] ?? ''));
}

function changeOf(newer: VersionBlock, older: VersionBlock, moved: boolean): VersionChange | null {
  const textChanged = newer.text !== older.text;
  const kind: VersionChangeKind | null = moved
    ? 'move'
    : textChanged
      ? 'modification'
      : newer.format !== older.format
        ? 'formatting'
        : null;
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

/**
 * The changes from an older version of a document to a newer one, in the newer one's order:
 * blocks inserted, deleted, moved, with changed text or with changed formatting only.
 */
export function compareVersions(older: ProseMirrorNode, newer: ProseMirrorNode): VersionChange[] {
  const before = collectVersionBlocks(older);
  const after = collectVersionBlocks(newer);
  const olderByKey = new Map(before.map((block) => [block.key, block]));
  const newerByKey = new Map(after.map((block) => [block.key, block]));
  const kept = keptInOrder(
    before.filter((block) => newerByKey.has(block.key)).map((block) => block.key),
    after.filter((block) => olderByKey.has(block.key)).map((block) => block.key),
  );
  const changes: VersionChange[] = [];
  for (const block of after) {
    const previous = olderByKey.get(block.key);
    const change = previous
      ? changeOf(block, previous, !kept.has(block.key))
      : {
          kind: 'insertion' as const,
          id: block.id,
          parts: block.parts,
          at: null,
          text: block.text,
          previousText: null,
          segments: [],
          positions: block.positions,
        };
    if (change) changes.push(change);
  }
  changes.push(...deletionsOf(before, newerByKey, after.at(-1)));
  // A deletion placed before a block comes before that block's own change.
  const placeOf = (change: VersionChange) =>
    change.parts[0]?.from ?? (change.at ? change.at.from - (change.at.after ? -0.5 : 0.5) : 0);
  return changes.sort((a, b) => placeOf(a) - placeOf(b));
}
