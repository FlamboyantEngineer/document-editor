// Reading and deciding suggestions: the suggestions a document holds, each with what it inserts
// and deletes, and commands that accept or reject them.

import type { Mark, Node as ProseMirrorNode } from 'prosemirror-model';
import type { Command, Transaction } from 'prosemirror-state';
import { suggestionsKey } from './suggestions.js';

/** One suggestion: the text it inserts and deletes, and who suggested it. */
export interface Suggestion {
  readonly id: string;
  readonly author: string | null;
  /** The comment thread the suggestion is discussed in, when it has one. */
  readonly thread: string | null;
  readonly from: number;
  readonly to: number;
  readonly inserted: string;
  readonly deleted: string;
}

interface Collecting {
  id: string;
  author: string | null;
  thread: string | null;
  from: number;
  to: number;
  inserted: string;
  deleted: string;
}

function collect(
  found: Map<string, Collecting>,
  mark: Mark,
  [from, to]: readonly [number, number],
) {
  const id = String(mark.attrs.dataId);
  const entry = found.get(id) ?? {
    id,
    author: (mark.attrs.dataAuthor as string | null) ?? null,
    thread: (mark.attrs.commentId as string | null) ?? null,
    from,
    to,
    inserted: '',
    deleted: '',
  };
  entry.author ??= (mark.attrs.dataAuthor as string | null) ?? null;
  entry.thread ??= (mark.attrs.commentId as string | null) ?? null;
  entry.from = Math.min(entry.from, from);
  entry.to = Math.max(entry.to, to);
  found.set(id, entry);
  return entry;
}

/** The suggestions in a document, in reading order. */
export function listSuggestions(doc: ProseMirrorNode): Suggestion[] {
  const { insertion, deletion } = doc.type.schema.marks;
  const found = new Map<string, Collecting>();
  doc.descendants((node, pos) => {
    const block: unknown = node.attrs.suggestionSplitId;
    const kind: unknown = node.attrs.suggestionSplitKind;
    if (kind && typeof block === 'string') {
      // An inserted block is the suggester's own; a block suggested for deletion is its writer's.
      const author: unknown = kind === 'insertion' ? node.attrs.dataAuthor : null;
      const mark = node.type.schema.mark('insertion', { dataId: block, dataAuthor: author });
      collect(found, mark, [pos, pos + node.nodeSize]);
    }
    if (!node.isInline) return true;
    for (const mark of node.marks) {
      if (mark.type !== insertion && mark.type !== deletion) continue;
      const entry = collect(found, mark, [pos, pos + node.nodeSize]);
      const text = node.text ?? '';
      if (mark.type === insertion) entry.inserted += text;
      else entry.deleted += text;
    }
    return false;
  });
  return [...found.values()].sort((a, b) => a.from - b.from);
}

/** Whether a reader accepts or rejects a suggestion. */
export type SuggestionDecision = 'accept' | 'reject';

/**
 * Accepts or rejects suggestions, every one or those with the given ids: accepting keeps what a
 * suggestion inserts and removes what it deletes, rejecting the reverse. Returns whether the
 * document changed.
 */
export function decideSuggestions(
  tr: Transaction,
  decision: SuggestionDecision,
  ids: ReadonlySet<string> | null = null,
): boolean {
  const { insertion, deletion } = tr.doc.type.schema.marks;
  if (!insertion || !deletion) return false;
  const chosen = (id: unknown) => typeof id === 'string' && (ids === null || ids.has(id));
  const [kept, removed] = decision === 'accept' ? [insertion, deletion] : [deletion, insertion];
  const removedKind = decision === 'accept' ? 'deletion' : 'insertion';
  const ranges: [number, number][] = [];
  const before = tr.steps.length;
  tr.doc.descendants((node, pos) => {
    const kind: unknown = node.attrs.suggestionSplitKind;
    if (kind && chosen(node.attrs.suggestionSplitId)) {
      if (kind === removedKind) {
        ranges.push([pos, pos + node.nodeSize]);
        return false;
      }
      tr.setNodeMarkup(pos, null, {
        ...node.attrs,
        suggestionSplitKind: null,
        suggestionSplitId: null,
      });
    }
    if (!node.isInline) return true;
    for (const mark of node.marks) {
      if (!chosen(mark.attrs.dataId)) continue;
      if (mark.type === kept) tr.removeMark(pos, pos + node.nodeSize, mark);
      if (mark.type === removed) ranges.push([pos, pos + node.nodeSize]);
    }
    return false;
  });
  for (const [from, to] of ranges.reverse()) {
    try {
      tr.delete(from, to);
    } catch {
      // A block its parent cannot do without stays; its marks are already decided.
    }
  }
  return tr.steps.length > before;
}

function decide(decision: SuggestionDecision, ids: ReadonlySet<string> | null): Command {
  return (state, dispatch) => {
    const tr = state.tr.setMeta(suggestionsKey, 'decide');
    if (!decideSuggestions(tr, decision, ids)) return false;
    dispatch?.(tr.scrollIntoView());
    return true;
  };
}

/** Accepts one suggestion. */
export const acceptSuggestion = (id: string): Command => decide('accept', new Set([id]));
/** Rejects one suggestion. */
export const rejectSuggestion = (id: string): Command => decide('reject', new Set([id]));
/** Accepts every suggestion. */
export const acceptAllSuggestions: Command = decide('accept', null);
/** Rejects every suggestion. */
export const rejectAllSuggestions: Command = decide('reject', null);
