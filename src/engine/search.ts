// Finding and replacing text. Two searches run side by side, each a plugin with its own state:
// the find bar's (`find`) and the search pane's (`pane`). Each keeps a query, its matches in the
// document's text blocks, page headers and footers left out, and the current one, marked by
// decorations of its own; commands move between matches, reveal one and replace one or all.

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
import { DecorationSet, type EditorView } from 'prosemirror-view';
import { viewOnlyInline } from '../utils/view-only-decorations.js';
import {
  findMatches,
  findMatchesInBlocks,
  isMatchReplaceable,
  type SearchMatch,
  type SearchOptions,
} from './search-text.js';
import { isInlineTextOnly } from './transaction-kind.js';

export type { SearchMatch, SearchOptions } from './search-text.js';
export { isMatchReplaceable, searchSeed } from './search-text.js';

/** Which search: the find bar's or the search pane's. */
export type SearchScope = 'find' | 'pane';

/** What a search plugin keeps. */
export interface SearchState {
  readonly query: string;
  readonly options: SearchOptions;
  readonly matches: readonly SearchMatch[];
  /** The current match's index, or -1 without matches. */
  readonly current: number;
  readonly decorations: DecorationSet;
}

type SearchMeta =
  | { readonly query: string; readonly options: SearchOptions }
  | { readonly current: number }
  // A replacement was made: the search goes on with the first match starting at or after `after`.
  | { readonly after: number };

/** The find bar's search plugin. */
export const searchKey = new PluginKey<SearchState>('search');

/** The search pane's search plugin. */
export const searchPaneKey = new PluginKey<SearchState>('search-pane');

/** The hook a find bar match carries: `current` for the current match, `match` otherwise. */
export const SEARCH_MATCH_ATTR = 'data-search-match';

/** The hook a search pane match carries: `current` for the current match, `match` otherwise. */
export const SEARCH_RESULT_ATTR = 'data-search-result';

const keys: Readonly<Record<SearchScope, PluginKey<SearchState>>> = {
  find: searchKey,
  pane: searchPaneKey,
};

const attributes: Readonly<Record<SearchScope, string>> = {
  find: SEARCH_MATCH_ATTR,
  pane: SEARCH_RESULT_ATTR,
};

const decorationOf = (scope: SearchScope, match: SearchMatch, current: boolean) =>
  viewOnlyInline(match, { [attributes[scope]]: current ? 'current' : 'match' });

function decorate(doc: ProseMirrorNode, scope: SearchScope, value: SearchState) {
  return DecorationSet.create(
    doc,
    value.matches.map((match, index) => decorationOf(scope, match, index === value.current)),
  );
}

interface Searched {
  readonly doc: ProseMirrorNode;
  readonly scope: SearchScope;
  /** Tells the match the search goes on from: the first it takes is current, or the first of all. */
  readonly from: (match: SearchMatch) => boolean;
}

// The state with its matches found again, and the current one chosen.
function searched({ doc, scope, from }: Searched, value: SearchState) {
  const matches = findMatches(doc, value);
  const current = matches.length === 0 ? -1 : Math.max(matches.findIndex(from), 0);
  const next = { ...value, matches, current };
  return { ...next, decorations: decorate(doc, scope, next) };
}

function apply(scope: SearchScope, tr: Transaction, value: SearchState): SearchState {
  const meta = tr.getMeta(keys[scope]) as SearchMeta | undefined;
  const { doc } = tr;
  if (meta && 'query' in meta) {
    // The first match at or after the selection, one holding its start included.
    const from = (match: SearchMatch) => match.to >= tr.selection.from;
    return searched({ doc, scope, from }, { ...value, ...meta });
  }
  if (meta && 'current' in meta) {
    const next = { ...value, current: meta.current };
    return { ...next, decorations: decorate(doc, scope, next) };
  }
  if (!tr.docChanged || !value.query) return value;
  // The current match stays current where it now starts. After a replacement the search goes on
  // behind it: by its start a match is never one the replacement holds, nor the match before it.
  const near = value.matches[value.current]?.from;
  const start = meta ? meta.after : near === undefined ? 0 : tr.mapping.map(near);
  const from = (match: SearchMatch) => match.from >= start;
  if (!meta && isInlineTextOnly(tr)) return typed({ tr, scope, from }, value);
  return searched({ doc, scope, from }, value);
}

// The start of each text block a typing change touched, in the document after it.
function typedBlocks(tr: Transaction): number[] {
  const starts = new Set<number>();
  tr.steps.forEach((step, index) => {
    const rest = tr.mapping.slice(index + 1);
    step.getMap().forEach((...[, , start, end]) => {
      for (const pos of [rest.map(start, -1), rest.map(end, 1)]) {
        const $pos = tr.doc.resolve(pos);
        if ($pos.parent.isTextblock) starts.add($pos.before());
      }
    });
  });
  return [...starts].sort((one, other) => one - other);
}

/**
 * After a change that only types text: the matches of other blocks mapped, those of the blocks
 * it touched found again, and the decorations changed only there and where the current match was
 * or now is (DOCE-SEARCH-1.1), so typing never walks the document.
 */
function typed(
  {
    tr,
    scope,
    from,
  }: { tr: Transaction; scope: SearchScope; from: (match: SearchMatch) => boolean },
  value: SearchState,
): SearchState {
  const { doc } = tr;
  const blocks = typedBlocks(tr).map((pos) => ({
    from: pos,
    to: pos + (doc.nodeAt(pos)?.nodeSize ?? 0),
  }));
  const inTyped = (pos: number) => blocks.some((block) => pos > block.from && pos < block.to);
  const kept: SearchMatch[] = [];
  for (const match of value.matches) {
    const start = tr.mapping.mapResult(match.from, 1);
    const end = tr.mapping.mapResult(match.to, -1);
    if (start.deleted || end.deleted || end.pos <= start.pos || inTyped(start.pos)) continue;
    kept.push({ from: start.pos, to: end.pos });
  }
  const found = findMatchesInBlocks(
    doc,
    blocks.map((block) => block.from),
    value,
  );
  const matches = [...kept, ...found].sort((one, other) => one.from - other.from);
  const current = matches.length === 0 ? -1 : Math.max(matches.findIndex(from), 0);
  const next = { ...value, matches, current };
  // Drawn again: the typed blocks, and the matches that were or are now current.
  const was = value.matches[value.current];
  const dirty = [...blocks];
  if (was) dirty.push({ from: tr.mapping.map(was.from, 1), to: tr.mapping.map(was.to, -1) });
  const now = matches[current];
  if (now) dirty.push(now);
  let decorations = value.decorations.map(tr.mapping, doc);
  const redrawn = new Set<number>();
  for (const range of dirty) {
    decorations = decorations.remove(decorations.find(range.from, range.to));
    matches.forEach((match, index) => {
      if (match.to >= range.from && match.from <= range.to) redrawn.add(index);
    });
  }
  const one = (index: number) => {
    const match = matches[index];
    return match && decorationOf(scope, match, index === current);
  };
  const added = [...redrawn].map(one).filter((each) => each !== undefined);
  return { ...next, decorations: decorations.add(doc, added) };
}

/** The plugin of one search, the find bar's by default. */
export function createSearch(scope: SearchScope = 'find'): Plugin<SearchState> {
  return new Plugin<SearchState>({
    key: keys[scope],
    state: {
      init: () => ({
        query: '',
        options: {},
        matches: [],
        current: -1,
        decorations: DecorationSet.empty,
      }),
      apply: (tr, value) => apply(scope, tr, value),
    },
    props: { decorations: (state) => keys[scope].getState(state)?.decorations ?? null },
  });
}

/** A search's state, the find bar's by default; null when the document is not searched so. */
export function searchState(state: EditorState, scope: SearchScope = 'find'): SearchState | null {
  return keys[scope].getState(state) ?? null;
}

/** Looks for a query, from the selection on; an empty query clears the matches. */
export function setSearch(
  query: string,
  options: SearchOptions = {},
  scope: SearchScope = 'find',
): Command {
  return (state, dispatch) => {
    if (!searchState(state, scope)) return false;
    dispatch?.(state.tr.setMeta(keys[scope], { query, options }).setMeta('addToHistory', false));
    return true;
  };
}

// Selects a match and makes it current.
function selectAt(state: EditorState, index: number) {
  const match = searchKey.getState(state)?.matches[index];
  if (!match) return null;
  return state.tr
    .setMeta(searchKey, { current: index })
    .setSelection(TextSelection.create(state.doc, match.from, match.to))
    .setMeta('addToHistory', false)
    .scrollIntoView();
}

// Selects the find bar's next or previous match.
function selectMatch(step: 1 | -1): Command {
  return (state, dispatch) => {
    const search = searchKey.getState(state);
    if (!search || search.matches.length === 0) return false;
    const count = search.matches.length;
    const tr = selectAt(state, (search.current + step + count) % count);
    if (!tr) return false;
    dispatch?.(tr);
    return true;
  };
}

/** Selects the find bar's next match, wrapping to the first. */
export const selectNextMatch: Command = selectMatch(1);

/** Selects the find bar's previous match, wrapping to the last. */
export const selectPreviousMatch: Command = selectMatch(-1);

// Scrolls a position's text into the middle of the view.
function scrollTo(view: EditorView, pos: number) {
  const { node } = view.domAtPos(pos);
  const element = node.nodeType === 1 ? (node as Element) : node.parentElement;
  if (element && 'scrollIntoView' in element) element.scrollIntoView({ block: 'center' });
}

/**
 * Makes a match of a search current and scrolls it into view, leaving the selection where it is,
 * so the writer's caret stays put while they look through the matches.
 */
export function revealMatchAt(index: number, scope: SearchScope = 'find'): Command {
  return (state, dispatch, view) => {
    const match = searchState(state, scope)?.matches[index];
    if (!match) return false;
    dispatch?.(state.tr.setMeta(keys[scope], { current: index }).setMeta('addToHistory', false));
    if (view) scrollTo(view, match.from);
    return true;
  };
}

// The match replaced: the replacement with the marks of the text it replaces.
function replaceIn(tr: Transaction, match: SearchMatch, replacement: string) {
  const marks = tr.doc.resolve(match.from + 1).marks();
  if (replacement)
    tr.replaceWith(match.from, match.to, tr.doc.type.schema.text(replacement, marks));
  else tr.delete(match.from, match.to);
}

/**
 * Replaces a search's current match, refused when the writer may not replace it
 * (`isMatchReplaceable`). The find bar then puts the caret after the replacement; the pane leaves
 * the selection where it was.
 */
export function replaceMatch(replacement: string, scope: SearchScope = 'find'): Command {
  return (state, dispatch) => {
    const search = searchState(state, scope);
    const match = search?.matches[search.current];
    if (!match || !isMatchReplaceable(state, match)) return false;
    if (dispatch) {
      const tr = state.tr;
      replaceIn(tr, match, replacement);
      closeHistory(tr);
      const meta: SearchMeta = { after: match.from + replacement.length };
      tr.setMeta(keys[scope], meta);
      if (scope === 'find') {
        tr.setSelection(TextSelection.create(tr.doc, match.from + replacement.length));
      }
      dispatch(tr);
    }
    return true;
  };
}

/** Replaces each match of a search the writer may replace, as one change; the others stay found. */
export function replaceAllMatches(replacement: string, scope: SearchScope = 'find'): Command {
  return (state, dispatch) => {
    const matches = (searchState(state, scope)?.matches ?? []).filter((match) =>
      isMatchReplaceable(state, match),
    );
    if (matches.length === 0) return false;
    if (dispatch) {
      const tr = state.tr;
      for (const match of [...matches].reverse()) replaceIn(tr, match, replacement);
      closeHistory(tr);
      dispatch(scope === 'find' ? tr.scrollIntoView() : tr);
    }
    return true;
  };
}
