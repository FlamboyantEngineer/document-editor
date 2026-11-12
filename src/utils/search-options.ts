// The search options a find control offers, as the keys of its selected options and as the search
// plugin's options, so every control over one search shows the same choices.

import type { Key } from '@flamboyantengineer/ui-components/core';
import type { EditorState } from 'prosemirror-state';
import { type SearchOptions, type SearchScope, searchState } from '../engine/index.js';

/** The plugin options the selected option keys stand for: `case` and `word`. */
export function searchOptionsOf(keys: ReadonlySet<Key>): SearchOptions {
  return { caseSensitive: keys.has('case'), wholeWord: keys.has('word') };
}

/** The option keys selected for the plugin's options. */
export function searchOptionKeys(options: SearchOptions | undefined): Set<Key> {
  const keys = new Set<Key>();
  if (options?.caseSensitive) keys.add('case');
  if (options?.wholeWord) keys.add('word');
  return keys;
}

/** What a find control shows of the search a plugin holds. */
export function searchControlState(state: EditorState, scope: SearchScope) {
  const search = searchState(state, scope);
  return {
    query: search?.query ?? '',
    selected: searchOptionKeys(search?.options),
    current: search?.current ?? -1,
    matchCount: search?.matches.length ?? 0,
  };
}
