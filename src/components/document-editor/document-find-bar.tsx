// The editor's find bar, opened with Mod-F: the base library's FindBar over the search plugin
// (`createSearch`), with matching case and whole words, and Replace and Replace all while the
// writer can edit. The query and options are the plugin's, so the find bar and a search pane show
// one search. Closing it clears the matches and returns focus to the document.

import type { Key } from '@flamboyantengineer/ui-components/core';
import { FindBar } from '@flamboyantengineer/ui-components/find-bar';
import {
  replaceAllMatches,
  replaceMatch,
  selectNextMatch,
  selectPreviousMatch,
  setSearch,
} from '../../engine/index.js';
import { searchControlState, searchOptionsOf } from '../../utils/search-options.js';
import type { EditorContext } from './editor-context.js';

interface DocumentFindBarProps {
  context: EditorContext;
  onClose: () => void;
  className?: string | undefined;
}

// Focuses the find box when it mounts. A ref callback made once, so a later render, as each change
// of the document makes, never pulls focus back to the box.
const focusOnce = (input: HTMLInputElement | null) => input?.focus();

/** The find bar, searching the document the context shows. */
export function DocumentFindBar({ context, onClose, className }: DocumentFindBarProps) {
  const { labels, view } = context;
  const { query, selected, current, matchCount } = searchControlState(context.state);
  // Runs a command without taking focus from the find bar.
  const run = (command: Parameters<EditorContext['run']>[0]) => {
    if (view) command(view.state, view.dispatch, view);
  };
  const canReplace = context.editable && !context.locked;
  return (
    <FindBar
      className={className}
      label={labels.find}
      query={query}
      onQueryChange={(next) => run(setSearch(next, searchOptionsOf(selected)))}
      matchCount={query ? matchCount : undefined}
      currentIndex={current}
      onNext={() => run(selectNextMatch)}
      onPrevious={() => run(selectPreviousMatch)}
      options={[
        { id: 'case', label: labels.matchCase },
        { id: 'word', label: labels.wholeWord },
      ]}
      selectedOptions={selected}
      onSelectedOptionsChange={(keys: Set<Key>) => run(setSearch(query, searchOptionsOf(keys)))}
      {...(canReplace
        ? {
            onReplace: (replacement: string) => run(replaceMatch(replacement)),
            onReplaceAll: (replacement: string) => run(replaceAllMatches(replacement)),
          }
        : {})}
      inputRef={focusOnce}
      onClose={() => {
        run(setSearch(''));
        onClose();
        view?.focus();
      }}
    />
  );
}
