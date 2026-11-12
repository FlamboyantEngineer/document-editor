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
  isMatchReplaceable,
  type SearchMatch,
  type SearchOptions,
} from './search-text.js';

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
  { readonly query: string; readonly options: SearchOptions } | { readonly current: number };

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

function decorate(doc: ProseMirrorNode, scope: SearchScope, value: SearchState) {
  return DecorationSet.create(
    doc,
    value.matches.map((match, index) =>
      viewOnlyInline(match, { [attributes[scope]]: index === value.current ? 'current' : 'match' }),
    ),
  );
}

// The state with its matches found again; the current match is the first at or after `near`.
function searched(
  { doc, scope, near }: { doc: ProseMirrorNode; scope: SearchScope; near: number | null },
  value: SearchState,
) {
  const matches = findMatches(doc, value);
  const after = near === null ? -1 : matches.findIndex((match) => match.to >= near);
  const current = matches.length === 0 ? -1 : Math.max(after, 0);
  const next = { ...value, matches, current };
  return { ...next, decorations: decorate(doc, scope, next) };
}

function apply(scope: SearchScope, tr: Transaction, value: SearchState): SearchState {
  const meta = tr.getMeta(keys[scope]) as SearchMeta | undefined;
  if (meta && 'query' in meta) {
    return searched({ doc: tr.doc, scope, near: tr.selection.from }, { ...value, ...meta });
  }
  if (meta && 'current' in meta) {
    const next = { ...value, current: meta.current };
    return { ...next, decorations: decorate(tr.doc, scope, next) };
  }
  if (!tr.docChanged || !value.query) return value;
  const near = value.matches[value.current]?.from;
  return searched(
    { doc: tr.doc, scope, near: near === undefined ? null : tr.mapping.map(near) },
    value,
  );
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
