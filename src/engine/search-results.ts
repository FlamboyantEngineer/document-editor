// A search's matches as a results list shows them: each in the text of its block, under the
// heading it is under, and whether the writer may replace it.

import type { EditorState } from 'prosemirror-state';
import type { TemplateFile } from '../model/index.js';
import { documentOutline } from './outline.js';
import { isMatchReplaceable, type SearchScope, searchState } from './search.js';
import { searchedText } from './search-text.js';

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
  return search.matches.map((match, index) => {
    for (let at = headings[next]; at && at.pos <= match.from; at = headings[next]) {
      heading = [at.number, at.text].filter(Boolean).join(' ');
      next += 1;
    }
    const $from = state.doc.resolve(match.from);
    const { text, spans } = searchedText($from.parent, $from.before());
    const start = spans.findIndex((span) => span.from >= match.from);
    const end = spans.findLastIndex((span) => span.to <= match.to) + 1;
    return {
      index,
      source: text,
      start,
      end,
      heading,
      replaceable: isMatchReplaceable(state, match),
    };
  });
}
