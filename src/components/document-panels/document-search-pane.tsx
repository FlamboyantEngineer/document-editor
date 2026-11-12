// The search pane: the base library's SearchPane over the search pane's own search plugin
// (`createSearch('pane')`), apart from the find bar's, listing every match in the text around it,
// under the heading it is in, and replacing them while the writer can edit. It searches once the
// reader pauses typing, takes the reader to a match without moving the caret, and announces how
// many matches Replace all replaced. It sits beside the document, inside the editor or given the
// editor's context.

import { Announcer, useAnnounce } from '@flamboyantengineer/ui-components/announcer';
import type { Key } from '@flamboyantengineer/ui-components/core';
import { SearchPane } from '@flamboyantengineer/ui-components/search-pane';
import type { Command, EditorState } from 'prosemirror-state';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  replaceAllMatches,
  replaceMatch,
  revealMatchAt,
  searchResults,
  searchState,
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

// How long the reader pauses typing before the pane searches, in milliseconds.
const searchDelay = 250;

// The matches of the pane's search, none without a query.
function useSearchResults(state: EditorState, template: TemplateFile | undefined) {
  return useMemo(
    () =>
      searchState(state, 'pane')?.query ? searchResults(state, { scope: 'pane', template }) : [],
    [state, template],
  );
}

// The query the reader is typing, searched once they pause (`search`); null while none waits.
function useDebouncedQuery(search: (query: string) => void) {
  const [typed, setTyped] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timerRef.current), []);
  return {
    typed,
    type(query: string) {
      clearTimeout(timerRef.current);
      setTyped(query);
      const settle = () => {
        setTyped(null);
        search(query);
      };
      if (query) timerRef.current = setTimeout(settle, searchDelay);
      else settle();
    },
    settle() {
      clearTimeout(timerRef.current);
      setTyped(null);
    },
  };
}

// The pane inside its announcer.
function SearchPaneBody({
  context,
  ...props
}: DocumentSearchPaneProps & { context: EditorContext }) {
  const results = useSearchResults(context.state, props.template);
  const announce = useAnnounce();
  const { query, selected, current } = searchControlState(context.state, 'pane');
  const { labels, view } = context;
  // Runs a command on the view without taking focus from the pane.
  const run = (command: Command) => (view ? command(view.state, view.dispatch, view) : false);
  const pending = useDebouncedQuery((next) =>
    run(setSearch(next, searchOptionsOf(selected), 'pane')),
  );
  const shown = pending.typed ?? query;
  const canReplace = context.editable && !context.locked;
  const replaceAll = (replacement: string) => {
    const count = results.filter((result) => result.replaceable).length;
    if (run(replaceAllMatches(replacement, 'pane'))) announce(labels.replacedCount(count));
  };
  return (
    <SearchPane
      className={props.className}
      label={labels.searchDocument}
      query={shown}
      onQueryChange={pending.type}
      options={[
        { id: 'case', label: labels.matchCase },
        { id: 'word', label: labels.wholeWord },
      ]}
      selectedOptions={selected}
      onSelectedOptionsChange={(keys: Set<Key>) => {
        pending.settle();
        run(setSearch(shown, searchOptionsOf(keys), 'pane'));
      }}
      status={pending.typed !== null ? 'pending' : query ? 'ready' : 'idle'}
      results={results.map((result) => ({
        id: result.index,
        source: result.source,
        start: result.start,
        end: result.end,
        label: result.heading ?? undefined,
        isReplaceable: result.replaceable,
      }))}
      currentKey={current >= 0 ? current : null}
      onCurrentKeyChange={(key) => run(revealMatchAt(Number(key), 'pane'))}
      replaceMode={canReplace ? 'hidable' : 'none'}
      onReplace={canReplace ? (replacement) => run(replaceMatch(replacement, 'pane')) : undefined}
      onReplaceAll={canReplace ? replaceAll : undefined}
      onClose={() => {
        pending.settle();
        run(setSearch('', {}, 'pane'));
        props.onClose?.();
      }}
    />
  );
}

/** Searches the document and lists the matches, replacing them while the writer can edit. */
export function DocumentSearchPane(props: DocumentSearchPaneProps) {
  const held = useDocumentEditor();
  const context = props.context ?? held;
  if (!context) return null;
  return (
    <Announcer>
      <SearchPaneBody {...props} context={context} />
    </Announcer>
  );
}
