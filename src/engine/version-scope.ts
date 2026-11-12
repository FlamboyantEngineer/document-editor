// A comparison's scope and its counts: the blocks and headed sections a host compares, the changes
// inside them, the blocks outside them marked for dimming, and how many changes of each kind show.
// Changes kept through a transaction that only follows the layout are mapped, not recomputed.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { Mapping } from 'prosemirror-transform';
import { Decoration } from 'prosemirror-view';
import { regionKind } from '../model/index.js';
import { headingSectionSpan } from './outline.js';
import type { VersionChange, VersionChangeKind } from './version-compare.js';

/** A span of the document. */
export interface VersionSpan {
  readonly from: number;
  readonly to: number;
}

/** How many changes of each kind show, and in all. */
export type VersionChangeCounts = Readonly<Record<VersionChangeKind | 'total', number>>;

/**
 * The spans a scope of element ids covers: a structural heading's headed section
 * (`headingSectionSpan`), or another block whole. Ids the document does not hold cover nothing.
 */
export function resolveVersionScope(doc: ProseMirrorNode, ids: readonly string[]): VersionSpan[] {
  const wanted = new Set(ids);
  const spans: VersionSpan[] = [];
  doc.descendants((node, pos) => {
    const id = node.attrs.dataId;
    if (typeof id !== 'string' || !wanted.has(id)) return true;
    spans.push(headingSectionSpan(doc, pos) ?? { from: pos, to: pos + node.nodeSize });
    return node.type.name === 'heading';
  });
  return spans;
}

const overlaps = (spans: readonly VersionSpan[], from: number, to: number) =>
  spans.some((span) => from < span.to && to > span.from);

/** Whether a change is inside a scope: one of its parts, or where it is placed, overlaps it. */
export function isInVersionScope(change: VersionChange, spans: readonly VersionSpan[]): boolean {
  const place = change.parts.length ? change.parts : change.at ? [change.at] : [];
  return place.some((part) => overlaps(spans, part.from, part.to));
}

/** Marks each text block and leaf block outside a scope `data-diff-scope="outside"`. */
export function outsideScopeDecorations(
  doc: ProseMirrorNode,
  spans: readonly VersionSpan[],
): Decoration[] {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isBlock || (regionKind(node) ?? 'content') !== 'content') return false;
    const end = pos + node.nodeSize;
    if (spans.some((span) => pos >= span.from && end <= span.to)) return false;
    if (!(node.isTextblock || node.isAtom)) return true;
    if (!overlaps(spans, pos, end)) {
      decorations.push(Decoration.node(pos, end, { 'data-diff-scope': 'outside' }));
    }
    return false;
  });
  return decorations;
}

/** Counts changes by kind. */
export function countVersionChanges(changes: readonly VersionChange[]): VersionChangeCounts {
  const counts = { insertion: 0, deletion: 0, modification: 0, formatting: 0, move: 0 };
  for (const change of changes) counts[change.kind] += 1;
  return { ...counts, total: changes.length };
}

/** A change's positions mapped through a transaction that did not change what it compares. */
export function mapVersionChange(change: VersionChange, mapping: Mapping): VersionChange {
  const span = <T extends VersionSpan>(part: T): T => ({
    ...part,
    from: mapping.map(part.from, 1),
    to: mapping.map(part.to, -1),
  });
  return {
    ...change,
    parts: change.parts.map(span),
    at: change.at ? span(change.at) : null,
    positions: change.positions.map((pos) => mapping.map(pos)),
  };
}

/** A span mapped through a transaction. */
export const mapVersionSpan = (span: VersionSpan, mapping: Mapping): VersionSpan => ({
  from: mapping.map(span.from, 1),
  to: mapping.map(span.to, -1),
});
