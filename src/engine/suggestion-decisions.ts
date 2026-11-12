// Reading and deciding suggestions: the suggestions a document holds, each with what it inserts
// and deletes, and commands that accept or reject them. A suggestion's parts are its marks and
// blocks: those that share an id, and those discussed in the same comment thread.

import type { Mark, Node as ProseMirrorNode } from 'prosemirror-model';
import { type Command, PluginKey, type Transaction } from 'prosemirror-state';
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

// One part of a suggestion where it occurs: a mark on a run of inline content, or a block.
interface Piece {
  readonly key: string;
  readonly dataId: string | null;
  readonly thread: string | null;
  readonly author: string | null;
  readonly from: number;
  readonly to: number;
  readonly inserted: string;
  readonly deleted: string;
}

const text = (value: unknown) => (typeof value === 'string' && value ? value : null);

// The key of a part: its own id, or, for a part that has none, the thread it is discussed in.
function keyOf(dataId: string | null, thread: string | null): string | null {
  if (dataId) return `id:${dataId}`;
  return thread ? `thread:${thread}` : null;
}

function piecesOf(doc: ProseMirrorNode): Piece[] {
  const { insertion, deletion } = doc.type.schema.marks;
  const pieces: Piece[] = [];
  doc.descendants((node, pos) => {
    const block = text(node.attrs.suggestionSplitId);
    const kind: unknown = node.attrs.suggestionSplitKind;
    if (kind && block) {
      // An inserted block is the suggester's own; a block suggested for deletion is its writer's.
      const author = kind === 'insertion' ? text(node.attrs.dataAuthor) : null;
      const range = { from: pos, to: pos + node.nodeSize, inserted: '', deleted: '' };
      pieces.push({ key: `id:${block}`, dataId: block, thread: null, author, ...range });
    }
    if (!node.isInline) return true;
    for (const mark of node.marks) {
      if (mark.type !== insertion && mark.type !== deletion) continue;
      const dataId = text(mark.attrs.dataId);
      const thread = text(mark.attrs.commentId);
      const key = keyOf(dataId, thread);
      if (!key) continue;
      const value = node.text ?? '';
      pieces.push({
        key,
        dataId,
        thread,
        author: text(mark.attrs.dataAuthor),
        from: pos,
        to: pos + node.nodeSize,
        inserted: mark.type === insertion ? value : '',
        deleted: mark.type === deletion ? value : '',
      });
    }
    return false;
  });
  return pieces;
}

// Joins the keys of parts that belong together, by the thread they share.
function joinParts(pieces: readonly Piece[]): (key: string) => string {
  const parent = new Map<string, string>();
  const find = (key: string): string => {
    const up = parent.get(key);
    if (up === undefined || up === key) return key;
    const root = find(up);
    parent.set(key, root);
    return root;
  };
  for (const piece of pieces) {
    if (!piece.thread) continue;
    const [a, b] = [find(piece.key), find(`thread:${piece.thread}`)];
    if (a !== b) parent.set(b, a);
  }
  return find;
}

interface Collecting {
  id: string | null;
  firstThreadId: string | null;
  author: string | null;
  thread: string | null;
  from: number;
  to: number;
  inserted: string;
  deleted: string;
  keys: Set<string>;
}

/** The suggestions of a document, and the suggestion each part key belongs to. */
interface SuggestionIndex {
  readonly suggestions: readonly Suggestion[];
  /** The suggestion id of a part key. */
  readonly ofKey: ReadonlyMap<string, string>;
  /** The part keys of each suggestion. */
  readonly keysOf: ReadonlyMap<string, ReadonlySet<string>>;
}

function indexSuggestions(doc: ProseMirrorNode): SuggestionIndex {
  const pieces = piecesOf(doc);
  const find = joinParts(pieces);
  const groups = new Map<string, Collecting>();
  for (const piece of pieces) {
    const root = find(piece.key);
    const entry = groups.get(root) ?? {
      id: null,
      firstThreadId: null,
      author: null,
      thread: null,
      from: piece.from,
      to: piece.to,
      inserted: '',
      deleted: '',
      keys: new Set<string>(),
    };
    entry.id ??= piece.dataId;
    entry.firstThreadId ??= piece.thread;
    entry.author ??= piece.author;
    entry.thread ??= piece.thread;
    entry.from = Math.min(entry.from, piece.from);
    entry.to = Math.max(entry.to, piece.to);
    entry.inserted += piece.inserted;
    entry.deleted += piece.deleted;
    entry.keys.add(piece.key);
    groups.set(root, entry);
  }
  const suggestions: Suggestion[] = [];
  const ofKey = new Map<string, string>();
  const keysOf = new Map<string, ReadonlySet<string>>();
  for (const entry of groups.values()) {
    const id = entry.id ?? entry.firstThreadId ?? '';
    const { author, thread, from, to, inserted, deleted } = entry;
    suggestions.push({ id, author, thread, from, to, inserted, deleted });
    for (const key of entry.keys) ofKey.set(key, id);
    keysOf.set(id, entry.keys);
  }
  suggestions.sort((a, b) => a.from - b.from);
  return { suggestions, ofKey, keysOf };
}

/**
 * The suggestions in a document, in reading order. Parts discussed in the same comment thread are
 * one suggestion, whatever their ids, and a part with no id of its own is its thread's.
 */
export function listSuggestions(doc: ProseMirrorNode): Suggestion[] {
  return [...indexSuggestions(doc).suggestions];
}

/**
 * Who made a suggestion: its writer, or, for a suggestion no writer is recorded on, the writer of
 * the thread it is discussed in.
 */
export function suggestionAuthor(
  suggestion: Suggestion,
  threadAuthor: (thread: string) => string | null | undefined,
): string | null {
  if (suggestion.author) return suggestion.author;
  return suggestion.thread ? (threadAuthor(suggestion.thread) ?? null) : null;
}

/** Whether a reader accepts or rejects a suggestion. */
export type SuggestionDecision = 'accept' | 'reject';

/** A suggestion decided with another, because that decision removed its text. */
export interface DependentSuggestion {
  readonly suggestion: Suggestion;
  /** The decided suggestion whose decision removed it. */
  readonly dependsOn: string;
}

/** What a decision decided, each suggestion as it was before. */
export interface SuggestionDecisionReport {
  readonly decision: SuggestionDecision;
  /** The suggestions the reader decided. */
  readonly suggestions: readonly Suggestion[];
  /** Other suggestions the decision removed, such as those inside a rejected insertion. */
  readonly dependents: readonly DependentSuggestion[];
}

const decisionKey = new PluginKey<SuggestionDecisionReport>('suggestion-decision');

/** The decision a transaction made, when it decided suggestions (`decideSuggestions`). */
export function suggestionDecisionOf(tr: Transaction): SuggestionDecisionReport | null {
  return (tr.getMeta(decisionKey) as SuggestionDecisionReport | undefined) ?? null;
}

/** Which suggestions `decideSuggestions` decides, and how. */
export interface DecideOptions {
  /** The ids of the suggestions to decide; every one by default. */
  readonly ids?: ReadonlySet<string> | null | undefined;
  /** Who opened a thread, for the writer of a suggestion that records none. */
  readonly threadAuthor?: ((thread: string) => string | null | undefined) | undefined;
}

// Keeps who wrote accepted text: inserted text that names no contributor takes its suggester.
function keepAuthor(
  tr: Transaction,
  { node, pos }: { node: ProseMirrorNode; pos: number },
  author: string | null,
) {
  const { contributor } = tr.doc.type.schema.marks;
  if (!author || !contributor || contributor.isInSet(node.marks)) return;
  tr.addMark(pos, pos + node.nodeSize, contributor.create({ dataAuthor: author }));
}

// The suggestions the decision removed besides those decided, each with the decided one it was in.
function dependentsOf(
  before: SuggestionIndex,
  after: ProseMirrorNode,
  decided: readonly Suggestion[],
): DependentSuggestion[] {
  const left = new Set(piecesOf(after).map((piece) => piece.key));
  const chosen = new Set(decided.map((each) => each.id));
  const dependents: DependentSuggestion[] = [];
  for (const suggestion of before.suggestions) {
    if (chosen.has(suggestion.id)) continue;
    const keys = before.keysOf.get(suggestion.id) ?? new Set<string>();
    if ([...keys].some((key) => left.has(key))) continue;
    const around =
      decided.find((each) => each.from <= suggestion.from && suggestion.to <= each.to) ??
      decided.find((each) => each.from < suggestion.to && suggestion.from < each.to);
    if (around) dependents.push({ suggestion, dependsOn: around.id });
  }
  return dependents;
}

/**
 * Accepts or rejects suggestions, every one or those with the given ids: accepting keeps what a
 * suggestion inserts, attributed to its writer, and removes what it deletes; rejecting the reverse.
 * Returns what it decided, which the transaction also carries (`suggestionDecisionOf`), or null
 * when the document did not change.
 */
export function decideSuggestions(
  tr: Transaction,
  decision: SuggestionDecision,
  options: DecideOptions = {},
): SuggestionDecisionReport | null {
  const ids = options.ids ?? null;
  const { insertion, deletion } = tr.doc.type.schema.marks;
  if (!insertion || !deletion) return null;
  const before = indexSuggestions(tr.doc);
  const decided = before.suggestions.filter((each) => ids === null || ids.has(each.id));
  const authors = new Map(
    decided.map((each) => [each.id, suggestionAuthor(each, options.threadAuthor ?? (() => null))]),
  );
  const chosenOf = (key: string | null) => {
    const id = key === null ? undefined : before.ofKey.get(key);
    return id !== undefined && authors.has(id) ? id : null;
  };
  const [kept, removed] = decision === 'accept' ? [insertion, deletion] : [deletion, insertion];
  const removedKind = decision === 'accept' ? 'deletion' : 'insertion';
  const ranges: [number, number][] = [];
  const start = tr.steps.length;
  tr.doc.descendants((node, pos) => {
    const kind: unknown = node.attrs.suggestionSplitKind;
    if (kind && chosenOf(keyOf(text(node.attrs.suggestionSplitId), null))) {
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
      const id = chosenOf(markKey(mark));
      if (id === null) continue;
      if (mark.type === kept) {
        tr.removeMark(pos, pos + node.nodeSize, mark);
        if (kept === insertion) keepAuthor(tr, { node, pos }, authors.get(id) ?? null);
      }
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
  if (tr.steps.length === start) return null;
  const report: SuggestionDecisionReport = {
    decision,
    suggestions: decided,
    dependents: dependentsOf(before, tr.doc, decided),
  };
  tr.setMeta(decisionKey, report);
  return report;
}

const markKey = (mark: Mark) => keyOf(text(mark.attrs.dataId), text(mark.attrs.commentId));

function decide(decision: SuggestionDecision, ids: ReadonlySet<string> | null): Command {
  return (state, dispatch) => {
    const tr = state.tr.setMeta(suggestionsKey, 'decide');
    if (!decideSuggestions(tr, decision, { ids })) return false;
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
