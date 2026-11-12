// The search pane: the base library's SearchPane over the editor's search plugin, listing every
// match in the text around it, under the heading it is in, and replacing them while the writer can
// edit. It sits beside the document, inside the editor or given the editor's context. The query and
// options are the plugin's, so the pane and the find bar show one search.

import type { Key } from '@flamboyantengineer/ui-components/core';
import { SearchPane } from '@flamboyantengineer/ui-components/search-pane';
import type { Command, EditorState } from 'prosemirror-state';
import { useMemo } from 'react';
import {
  replaceAllMatches,
  replaceMatch,
  searchResults,
  searchState,
  selectMatchAt,
  setSearch,
} from '../../engine/index.js';
import type { TemplateFile } from '../../model/index.js';
import { searchControlState, searchOptionsOf } from '../../utils/search-options.js';
import { type EditorContext, useDocumentEditor } from '../document-editor/document-editor.js';

/** What the search pane searches. */
export interface DocumentSearchPaneProps {
  /** The editor searched; the editor holding the pane by default. */
  readonly context?: EditorContext | null | undefined;
  /** The template the headings the results are under are numbered by. */
  readonly template?: TemplateFile | undefined;
  /** Closes the pane; the search is cleared first. */
  readonly onClose?: (() => void) | undefined;
  readonly className?: string | undefined;
}

// The matches of the search the plugin holds, none without a query.
function useSearchResults(state: EditorState | null, template: TemplateFile | undefined) {
  return useMemo(
    () => (state && searchState(state)?.query ? searchResults(state, template) : []),
    [state, template],
  );
}

/** Searches the document and lists the matches, replacing them while the writer can edit. */
export function DocumentSearchPane(props: DocumentSearchPaneProps) {
  const held = useDocumentEditor();
  const context = props.context ?? held;
  const results = useSearchResults(context?.state ?? null, props.template);
  if (!context) return null;
  const { query, selected, current } = searchControlState(context.state);
  const { labels, view } = context;
  // Runs a command on the view without taking focus from the pane.
  const run = (command: Command) => {
    if (view) command(view.state, view.dispatch, view);
  };
  const canReplace = context.editable && !context.locked;
  return (
    <SearchPane
      className={props.className}
      label={labels.find}
      query={query}
      onQueryChange={(next) => run(setSearch(next, searchOptionsOf(selected)))}
      options={[
        { id: 'case', label: labels.matchCase },
        { id: 'word', label: labels.wholeWord },
      ]}
      selectedOptions={selected}
      onSelectedOptionsChange={(keys: Set<Key>) => run(setSearch(query, searchOptionsOf(keys)))}
      status={query ? 'ready' : 'idle'}
      results={results.map((result) => ({
        id: result.index,
        source: result.source,
        start: result.start,
        end: result.end,
        label: result.heading ?? undefined,
        isReplaceable: result.replaceable,
      }))}
      currentKey={current >= 0 ? current : null}
      onCurrentKeyChange={(key) => run(selectMatchAt(Number(key)))}
      replaceMode={canReplace ? 'hidable' : 'none'}
      onReplace={canReplace ? (replacement) => run(replaceMatch(replacement)) : undefined}
      onReplaceAll={canReplace ? (replacement) => run(replaceAllMatches(replacement)) : undefined}
      onClose={() => {
        run(setSearch(''));
        props.onClose?.();
      }}
    />
  );
}
