// The positions the page transform moves or drops, found again. Joining a section's pages moves
// every page's footnote entries onto the last page and drops the header rows a table continuation
// repeats, so positions inside them map nowhere through its steps. They are found again by footnote
// id and by row, at the same offset into the entry or the row.

import type { Node as ProseMirrorNode, ResolvedPos } from 'prosemirror-model';
import type { Mapping } from 'prosemirror-transform';
import { leadingHeaderRows } from '../model/index.js';

/** Which way a position is mapped: from the paged projection to the canonical document, or back. */
export type MapDirection = 'toCanonical' | 'toProjection';

function footnoteEntryAt($pos: ResolvedPos): { id: string; offset: number } | null {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    if (node.type.name !== 'footnote_entry') continue;
    const id = node.attrs.footnoteId as unknown;
    return typeof id === 'string' && id ? { id, offset: $pos.pos - $pos.start(depth) } : null;
  }
  return null;
}

// Where the content of a document's first entry of footnote `id` starts.
function findFootnoteEntry(doc: ProseMirrorNode, id: string): number | null {
  let found: number | null = null;
  doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (node.type.name === 'footnote_entry' && node.attrs.footnoteId === id) found = pos + 1;
    return node.isBlock && !node.isTextblock;
  });
  return found;
}

// Where row `row` of the table whose content starts at `start` starts.
function rowStart(table: ProseMirrorNode, start: number, row: number): number {
  let at = start;
  for (let index = 0; index < row; index += 1) at += table.child(index).nodeSize;
  return at;
}

// A position inside a header row a table continuation repeats: the row, the offset into it, and
// where the continuation's first body row starts.
function repeatedHeaderAt($pos: ResolvedPos) {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const table = $pos.node(depth);
    if (table.type.name !== 'table') continue;
    const part = table.attrs.splitPartIndex as unknown;
    if (typeof part !== 'number' || part < 1 || depth === $pos.depth) return null;
    const row = $pos.index(depth);
    const headers = leadingHeaderRows(table);
    if (row >= headers || headers >= table.childCount) return null;
    const start = $pos.start(depth);
    return {
      row,
      offset: $pos.pos - rowStart(table, start, row),
      bodyStart: rowStart(table, start, headers),
    };
  }
  return null;
}

// The start of row `row` in the table around `pos`.
function rowStartAround(doc: ProseMirrorNode, pos: number, row: number): number | null {
  const $pos = doc.resolve(pos);
  for (let depth = $pos.depth; depth >= 0; depth -= 1) {
    const table = $pos.node(depth);
    if (table.type.name !== 'table') continue;
    return row < table.childCount ? rowStart(table, $pos.start(depth), row) : null;
  }
  return null;
}

/** What a redirect reads: the position, the document it maps into, and the forward mapping. */
export interface Redirect {
  readonly $pos: ResolvedPos;
  readonly to: ProseMirrorNode;
  readonly direction: MapDirection;
  /** Projection to canonical. */
  readonly forward: Mapping;
}

/**
 * A position the page transform moved or dropped, found again: in the footnote entry of the same
 * id, or, from the projection, in the canonical header row a continuation repeats. Null when it is
 * in neither.
 */
export function redirectPosition({ $pos, to, direction, forward }: Redirect): number | null {
  const entry = footnoteEntryAt($pos);
  if (entry) {
    const start = findFootnoteEntry(to, entry.id);
    if (start === null) return null;
    return start + Math.min(entry.offset, to.resolve(start).parent.content.size);
  }
  if (direction !== 'toCanonical') return null;
  const header = repeatedHeaderAt($pos);
  if (!header) return null;
  const body = forward.mapResult(header.bodyStart + 1, 1);
  if (body.deletedAcross) return null;
  const start = rowStartAround(to, body.pos, header.row);
  return start === null ? null : start + header.offset;
}
