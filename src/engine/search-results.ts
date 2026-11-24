// A search's matches as a results list shows them: each in the text of its block, under the
// heading it is under, and whether the writer may replace it.

import type { EditorState } from 'prosemirror-state';
import type { TemplateFile } from '../model/index.js';
import { documentOutline } from './outline.js';
import { isMatchReplaceable, type SearchScope, searchState } from './search.js';
import { searchedText, type SearchMatch } from './search-text.js';

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
  /** Whether the writer may replace it (`isMatchReplaceable`). */
  readonly replaceable: boolean;
}

/** Which search the results list, and the template that numbers their headings. */
export interface SearchResultsOptions {
  readonly scope?: SearchScope | undefined;
  readonly template?: TemplateFile | undefined;
}

function resultBlock(state: EditorState, pos: number) {
  const $pos = state.doc.resolve(pos);
  return {
    ...searchedText($pos.parent, $pos.before()),
    limit: $pos.end(),
    start: 0,
    end: 0,
  };
}

// Matches and the ranges of the displayed characters both advance in document order.
function advanceOffsets(block: ReturnType<typeof resultBlock>, match: SearchMatch) {
  const { spans } = block;
  for (let span = spans[block.start]; span && span.from < match.from; span = spans[block.start]) {
    block.start += 1;
  }
  for (let span = spans[block.end]; span && span.to <= match.to; span = spans[block.end]) {
    block.end += 1;
  }
}

/**
 * A search's matches as results, the find bar's by default: each in the text of its block, under
 * the heading it is under, numbered by the template when it is given. Matches and headings both
 * follow the document, so one walk through the headings places every match.
 */
export function searchResults(
  state: EditorState,
  { scope = 'find', template }: SearchResultsOptions = {},
): SearchResult[] {
  const search = searchState(state, scope);
  if (!search || search.matches.length === 0) return [];
  const headings = documentOutline(state, template);
  let next = 0;
  let heading: string | null = null;
  let block: ReturnType<typeof resultBlock> | undefined;
  return search.matches.map((match, index) => {
    for (let at = headings[next]; at && at.pos <= match.from; at = headings[next]) {
      heading = [at.number, at.text].filter(Boolean).join(' ');
      next += 1;
    }
    if (!block || match.to > block.limit) block = resultBlock(state, match.from);
    advanceOffsets(block, match);
    return {
      index,
      source: block.text,
      start: block.start,
      end: block.end,
      heading,
      replaceable: isMatchReplaceable(state, match),
    };
  });
}
