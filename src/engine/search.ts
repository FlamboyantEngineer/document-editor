// Finding and replacing text: a plugin keeps the reader's query, the matches in the document's text
// blocks, page headers and footers left out, and the current one, marked by decorations carrying
// `data-search-match`; commands move between matches and replace one or all of them.

import { closeHistory } from 'prosemirror-history';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import {
  type Command,
  type EditorState,
  Plugin,
  PluginKey,
  TextSelection,
  type Transaction,
} from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { type RegionKind, regionKind, type TemplateFile } from '../model/index.js';
import { isPositionLocked } from './edit-lock.js';
import { documentOutline } from './outline.js';

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

/** What the search plugin keeps. */
export interface SearchState {
  readonly query: string;
  readonly options: SearchOptions;
  readonly matches: readonly SearchMatch[];
  /** The current match's index, or -1 without matches. */
  readonly current: number;
  readonly decorations: DecorationSet;
}

type SearchMeta =
  { readonly query: string; readonly options: SearchOptions } | { readonly current: number };

// Whether a match sits in content the writer may not change.
const isLocked = (state: EditorState, match: SearchMatch) =>
  isPositionLocked(state, match.from) || isPositionLocked(state, match.to - 1);

/** The search plugin's state. */
export const searchKey = new PluginKey<SearchState>('search');

/** The hook a match's decoration carries: `current` for the current match, `match` otherwise. */
export const SEARCH_MATCH_ATTR = 'data-search-match';

// Page headers and footers, which the template fills.
const SKIPPED: ReadonlySet<RegionKind | null> = new Set(['header', 'footer']);

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function pattern(query: string, { caseSensitive, wholeWord }: SearchOptions): RegExp | null {
  if (!query) return null;
  const body = wholeWord ? `(?<![\\p{L}\\p{N}])${escape(query)}(?![\\p{L}\\p{N}])` : escape(query);
  return new RegExp(body, caseSensitive ? 'gu' : 'giu');
}

// Each match of a pattern in the document's text blocks.
function findMatches(doc: ProseMirrorNode, regexp: RegExp | null): SearchMatch[] {
  if (!regexp) return [];
  const matches: SearchMatch[] = [];
  doc.descendants((node, pos) => {
    if (SKIPPED.has(regionKind(node))) return false;
    if (!node.isTextblock) return true;
    let text = '';
    const positions: number[] = [];
    node.forEach((child, offset) => {
      const length = child.isText ? (child.text?.length ?? 0) : 1;
      text += child.isText ? (child.text ?? '') : '￼';
      for (let index = 0; index < length; index += 1) positions.push(pos + 1 + offset + index);
    });
    for (const match of text.matchAll(regexp)) {
      const first = positions[match.index];
      const last = positions[match.index + match[0].length - 1];
      if (first !== undefined && last !== undefined) matches.push({ from: first, to: last + 1 });
    }
    return false;
  });
  return matches;
}

function decorate(doc: ProseMirrorNode, matches: readonly SearchMatch[], current: number) {
  return DecorationSet.create(
    doc,
    matches.map((match, index) =>
      Decoration.inline(match.from, match.to, {
        [SEARCH_MATCH_ATTR]: index === current ? 'current' : 'match',
      }),
    ),
  );
}

function searched(doc: ProseMirrorNode, value: SearchState, near: number | null): SearchState {
  const matches = findMatches(doc, pattern(value.query, value.options));
  const after = near === null ? -1 : matches.findIndex((match) => match.to >= near);
  const current = matches.length === 0 ? -1 : Math.max(after, 0);
  return { ...value, matches, current, decorations: decorate(doc, matches, current) };
}

function apply(tr: Transaction, value: SearchState): SearchState {
  const meta = tr.getMeta(searchKey) as SearchMeta | undefined;
  if (meta && 'query' in meta) {
    return searched(tr.doc, { ...value, ...meta }, tr.selection.from);
  }
  if (meta && 'current' in meta) {
    return {
      ...value,
      current: meta.current,
      decorations: decorate(tr.doc, value.matches, meta.current),
    };
  }
  if (!tr.docChanged || !value.query) return value;
  const near = value.matches[value.current]?.from;
  return searched(tr.doc, value, near === undefined ? null : tr.mapping.map(near));
}

/** The plugin that finds a query's matches in the document. */
export function createSearch(): Plugin<SearchState> {
  return new Plugin<SearchState>({
    key: searchKey,
    state: {
      init: () => ({
        query: '',
        options: {},
        matches: [],
        current: -1,
        decorations: DecorationSet.empty,
      }),
      apply,
    },
    props: { decorations: (state) => searchKey.getState(state)?.decorations ?? null },
  });
}

/** The search state, or null when the document is not searched. */
export function searchState(state: EditorState): SearchState | null {
  return searchKey.getState(state) ?? null;
}

/** Looks for a query, from the selection on; an empty query clears the matches. */
export function setSearch(query: string, options: SearchOptions = {}): Command {
  return (state, dispatch) => {
    if (!searchKey.getState(state)) return false;
    dispatch?.(state.tr.setMeta(searchKey, { query, options }).setMeta('addToHistory', false));
    return true;
  };
}

// Selects a match and makes it current.
function selectMatch(step: 1 | -1): Command {
  return (state, dispatch) => {
    const search = searchKey.getState(state);
    if (!search || search.matches.length === 0) return false;
    const count = search.matches.length;
    const current = (search.current + step + count) % count;
    const match = search.matches[current];
    if (!match) return false;
    dispatch?.(
      state.tr
        .setMeta(searchKey, { current })
        .setSelection(TextSelection.create(state.doc, match.from, match.to))
        .setMeta('addToHistory', false)
        .scrollIntoView(),
    );
    return true;
  };
}

/** Selects the match at an index of the matches, making it current. */
export function selectMatchAt(index: number): Command {
  return (state, dispatch) => {
    const match = searchKey.getState(state)?.matches[index];
    if (!match) return false;
    dispatch?.(
      state.tr
        .setMeta(searchKey, { current: index })
        .setSelection(TextSelection.create(state.doc, match.from, match.to))
        .setMeta('addToHistory', false)
        .scrollIntoView(),
    );
    return true;
  };
}

/** A match as a results list shows it: the text of its block, where it is, and whether it may change. */
export interface SearchResult {
  readonly index: number;
  /** The text of the block holding it. */
  readonly source: string;
  /** Where the match starts and ends in `source`. */
  readonly start: number;
  readonly end: number;
  /** The heading it is under, as `<number> <text>`, or null before the first heading. */
  readonly heading: string | null;
  /** Whether the writer may replace it. */
  readonly replaceable: boolean;
}

/**
 * The search's matches as results: each in the text of its block, under the heading it is under,
 * numbered by the template when it is given.
 */
export function searchResults(state: EditorState, template?: TemplateFile): SearchResult[] {
  const search = searchKey.getState(state);
  if (!search) return [];
  const headings = documentOutline(state, template);
  return search.matches.map((match, index) => {
    const $from = state.doc.resolve(match.from);
    const start = $from.start();
    const under = headings.filter((heading) => heading.pos <= match.from).at(-1);
    return {
      index,
      source: $from.parent.textBetween(0, $from.parent.content.size, ' ', ' '),
      start: match.from - start,
      end: Math.min(match.to, $from.end()) - start,
      heading: under ? [under.number, under.text].filter(Boolean).join(' ') : null,
      replaceable: !isLocked(state, match),
    };
  });
}

/** Selects the next match, wrapping to the first. */
export const selectNextMatch: Command = selectMatch(1);

/** Selects the previous match, wrapping to the last. */
export const selectPreviousMatch: Command = selectMatch(-1);

/** Replaces the current match, then selects the next. */
export function replaceMatch(replacement: string): Command {
  return (state, dispatch) => {
    const search = searchKey.getState(state);
    const match = search?.matches[search.current];
    if (!match || isLocked(state, match)) return false;
    if (dispatch) {
      const marks = state.doc.resolve(match.from + 1).marks();
      const tr = replacement
        ? state.tr.replaceWith(match.from, match.to, state.schema.text(replacement, marks))
        : state.tr.delete(match.from, match.to);
      closeHistory(tr);
      dispatch(tr.setSelection(TextSelection.create(tr.doc, match.from + replacement.length)));
    }
    return true;
  };
}

/** Replaces every match outside locked content, as one change; locked matches stay found. */
export function replaceAllMatches(replacement: string): Command {
  return (state, dispatch) => {
    const matches = (searchKey.getState(state)?.matches ?? []).filter(
      (match) => !isLocked(state, match),
    );
    if (matches.length === 0) return false;
    if (dispatch) {
      const tr = state.tr;
      for (const match of [...matches].reverse()) {
        const marks = tr.doc.resolve(match.from + 1).marks();
        if (replacement)
          tr.replaceWith(match.from, match.to, state.schema.text(replacement, marks));
        else tr.delete(match.from, match.to);
      }
      closeHistory(tr);
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}
