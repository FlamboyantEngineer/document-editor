// The text search reads: each text block's characters, an inline node read whole as the text it
// shows, and whether a match may be replaced; and the query the selection seeds a search with.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { EditorState } from 'prosemirror-state';
import { type RegionKind, regionKind } from '../model/index.js';
import { isPositionLocked } from './edit-lock.js';

/** How a query matches. */
export interface SearchOptions {
  readonly caseSensitive?: boolean | undefined;
  /** Matches only whole words. */
  readonly wholeWord?: boolean | undefined;
}

/** A match, by its positions in the document. */
export interface SearchMatch {
  readonly from: number;
  readonly to: number;
}

// Page headers and footers, which the template fills.
const skipped: ReadonlySet<RegionKind | null> = new Set(['header', 'footer']);

// The longest selection that seeds a search; a longer one is a passage, not a query.
const seedLimit = 200;

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function pattern(query: string, { caseSensitive, wholeWord }: SearchOptions): RegExp | null {
  if (!query) return null;
  const body = wholeWord ? `(?<![\\p{L}\\p{N}])${escape(query)}(?![\\p{L}\\p{N}])` : escape(query);
  return new RegExp(body, caseSensitive ? 'gu' : 'giu');
}

// The text a node's DOM spec writes, such as a mention's `@` and label or a marker's number.
function specText(spec: unknown): string {
  if (typeof spec === 'string') return spec;
  if (!Array.isArray(spec)) return '';
  return spec.slice(1).map(specText).join('');
}

/**
 * The text an inline node shows: its `leafText`, such as a value it shows, the text it holds, or
 * the text its rendering writes; one object character when it shows none.
 */
function shownText(node: ProseMirrorNode): string {
  if (node.isText) return node.text ?? '';
  const leafText = node.type.spec.leafText?.(node);
  if (leafText) return leafText;
  if (node.content.size > 0) return node.textContent || '￼';
  return specText(node.type.spec.toDOM?.(node)) || '￼';
}

/**
 * A text block's text as search reads it, with the range of the document each character stands
 * for: a character of text itself, or the whole of the inline node that shows it, which a match
 * then covers whole.
 */
export function searchedText(
  node: ProseMirrorNode,
  pos: number,
): { text: string; spans: SearchMatch[] } {
  let text = '';
  const spans: SearchMatch[] = [];
  node.forEach((child, offset) => {
    const start = pos + 1 + offset;
    const read = shownText(child);
    text += read;
    for (let index = 0; index < read.length; index += 1) {
      spans.push(
        child.isText
          ? { from: start + index, to: start + index + 1 }
          : { from: start, to: start + child.nodeSize },
      );
    }
  });
  return { text, spans };
}

/** Each match of a query in the document's text blocks, page headers and footers left out. */
export function findMatches(
  doc: ProseMirrorNode,
  { query, options }: { query: string; options: SearchOptions },
): SearchMatch[] {
  const regexp = pattern(query, options);
  if (!regexp) return [];
  const matches: SearchMatch[] = [];
  doc.descendants((node, pos) => {
    if (skipped.has(regionKind(node))) return false;
    if (!node.isTextblock) return true;
    const { text, spans } = searchedText(node, pos);
    for (const match of text.matchAll(regexp)) {
      const first = spans[match.index];
      const last = spans[match.index + match[0].length - 1];
      if (first && last) matches.push({ from: first.from, to: last.to });
    }
    return false;
  });
  return matches;
}

/**
 * Whether the writer may replace a match: it is plain text, holding no inline node such as a
 * mention or a value the document shows, and none of it is locked.
 */
export function isMatchReplaceable(state: EditorState, match: SearchMatch): boolean {
  if (isPositionLocked(state, match.from) || isPositionLocked(state, match.to - 1)) return false;
  let plain = true;
  state.doc.nodesBetween(match.from, match.to, (node) => {
    if (node.isInline && !node.isText) plain = false;
    return plain;
  });
  return plain;
}

/**
 * The query a selection seeds a search with: the text it selects in one text block, inline nodes
 * read as the text they show; null for an empty selection, one across blocks or a long passage.
 */
export function searchSeed(state: EditorState): string | null {
  const { $from, $to, empty } = state.selection;
  if (empty || !$from.sameParent($to) || !$from.parent.isTextblock) return null;
  let text = '';
  $from.parent.forEach((child, offset) => {
    const start = $from.start() + offset;
    const end = start + child.nodeSize;
    if (end <= $from.pos || start >= $to.pos) return;
    text += child.isText
      ? (child.text ?? '').slice(Math.max($from.pos - start, 0), $to.pos - start)
      : shownText(child);
  });
  return text.trim() && text.length <= seedLimit ? text : null;
}
