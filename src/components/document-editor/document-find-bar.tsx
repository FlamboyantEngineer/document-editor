// The editor's find bar, opened with Mod-F: the base library's FindBar over the search plugin
// (`createSearch`), with matching case and whole words, and Replace and Replace all while the
// writer can edit. Closing it clears the matches and returns focus to the document.

import type { Key } from '@flamboyantengineer/ui-components/core';
import { FindBar } from '@flamboyantengineer/ui-components/find-bar';
import { useState } from 'react';
import {
  replaceAllMatches,
  replaceMatch,
  searchState,
  selectNextMatch,
  selectPreviousMatch,
  setSearch,
} from '../../engine/index.js';
import type { EditorContext } from './editor-context.js';

interface DocumentFindBarProps {
  context: EditorContext;
  onClose: () => void;
  className?: string | undefined;
}

/** The find bar, searching the document the context shows. */
export function DocumentFindBar({ context, onClose, className }: DocumentFindBarProps) {
  const { labels, view } = context;
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<Key>>(new Set());
  const search = searchState(context.state);
  const options = (keys: Set<Key>) => ({
    caseSensitive: keys.has('case'),
    wholeWord: keys.has('word'),
  });
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
      onQueryChange={(next) => {
        setQuery(next);
        run(setSearch(next, options(selected)));
      }}
      matchCount={query ? (search?.matches.length ?? 0) : undefined}
      currentIndex={search?.current ?? -1}
      onNext={() => run(selectNextMatch)}
      onPrevious={() => run(selectPreviousMatch)}
      options={[
        { id: 'case', label: labels.matchCase },
        { id: 'word', label: labels.wholeWord },
      ]}
      selectedOptions={selected}
      onSelectedOptionsChange={(keys) => {
        setSelected(keys);
        run(setSearch(query, options(keys)));
      }}
      {...(canReplace
        ? {
            onReplace: (replacement: string) => run(replaceMatch(replacement)),
            onReplaceAll: (replacement: string) => run(replaceAllMatches(replacement)),
          }
        : {})}
      inputRef={(input) => input?.focus()}
      onClose={() => {
        run(setSearch(''));
        onClose();
        view?.focus();
      }}
    />
  );
}
