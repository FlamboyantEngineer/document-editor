// The editor's find bar: the base library's FindBar over the find bar's own search plugin
// (`createSearch('find')`), with matching case and whole words, and Replace and Replace all while
// the writer can edit. Mod-F opens it at its find box and Mod-H at its replacement, from anywhere
// in the editor, seeded with the selected text. It takes focus only when asked to, never as the
// document changes. Closing it clears its matches and returns focus to the document.

import type { Key } from '@flamboyantengineer/ui-components/core';
import { FindBar } from '@flamboyantengineer/ui-components/find-bar';
import type { EditorView } from 'prosemirror-view';
import { type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import {
  isMatchReplaceable,
  matchesShortcut,
  replaceAllMatches,
  replaceMatch,
  searchSeed,
  searchState,
  selectNextMatch,
  selectPreviousMatch,
  setSearch,
  shortcutsOf,
} from '../../engine/index.js';
import { searchControlState, searchOptionsOf } from '../../utils/search-options.js';
import type { EditorContext } from './editor-context.js';

/** Which box of the find bar a request focuses: the find box, or the replacement box. */
export type FindBarMode = 'find' | 'replace';

/** One request to show the find bar; each is a new object, so asking again focuses again. */
export interface FindRequest {
  readonly mode: FindBarMode;
}

interface DocumentFindBarProps {
  context: EditorContext;
  /** The latest request, whose box the bar focuses. */
  request: FindRequest;
  onClose: () => void;
  className?: string | undefined;
}

// Whether the writer may replace the current match, and any match.
function replaceability(state: EditorContext['state']) {
  const search = searchState(state);
  const matches = search?.matches ?? [];
  const current = search ? matches[search.current] : undefined;
  return {
    current: Boolean(current && isMatchReplaceable(state, current)),
    any: matches.some((match) => isMatchReplaceable(state, match)),
  };
}

/**
 * The find bar's requests: `open` shows it at a box, seeding its search with the selected text,
 * null while the editor has no find bar; `close` hides it. Mod-F and Mod-H anywhere in the
 * editor's root open it (`useFindShortcuts`).
 */
export function useFindBar(
  rootRef: RefObject<HTMLElement | null>,
  view: EditorView | null,
  enabled: boolean,
) {
  const [request, setRequest] = useState<FindRequest | null>(null);
  const open = useMemo(() => {
    if (!enabled) return null;
    return (mode: FindBarMode = 'find') => {
      const seed = view ? searchSeed(view.state) : null;
      if (view && seed) {
        setSearch(seed, searchState(view.state)?.options)(view.state, view.dispatch, view);
      }
      setRequest({ mode });
    };
  }, [enabled, view]);
  useFindShortcuts(rootRef, view, open);
  return { request, open, close: () => setRequest(null) };
}

// Opens the find bar from anywhere in the editor: Mod-F at its find box, Mod-H at its replacement.
// A key something inside the editor already handled, as the search pane does these, is left alone.
function useFindShortcuts(
  rootRef: RefObject<HTMLElement | null>,
  view: EditorView | null,
  open: ((mode?: FindBarMode) => void) | null,
) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const table = view ? shortcutsOf(view.state) : null;
      const mode = table
        ? (['find', 'replace'] as const).find((id) => matchesShortcut(table, id, event))
        : undefined;
      if (!mode) return;
      event.preventDefault();
      open(mode);
    };
    root.addEventListener('keydown', onKeyDown);
    return () => root.removeEventListener('keydown', onKeyDown);
  }, [rootRef, view, open]);
}

/** The find bar, searching the document the context shows. */
export function DocumentFindBar({ context, request, onClose, className }: DocumentFindBarProps) {
  const { labels, view } = context;
  const { query, selected, current, matchCount } = searchControlState(context.state, 'find');
  const findRef = useRef<HTMLInputElement>(null);
  const replacementRef = useRef<HTMLInputElement>(null);
  // Focuses the requested box once per request, so the document's changes never take focus back.
  useEffect(() => {
    const input = (request.mode === 'replace' && replacementRef.current) || findRef.current;
    input?.focus();
    input?.select();
  }, [request]);
  // Runs a command without taking focus from the find bar.
  const run = (command: Parameters<EditorContext['run']>[0]) => {
    if (view) command(view.state, view.dispatch, view);
  };
  const canReplace = context.editable && !context.locked;
  const replaceable = replaceability(context.state);
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
            isReplaceDisabled: !replaceable.current,
            isReplaceAllDisabled: !replaceable.any,
            replacementInputRef: replacementRef,
          }
        : {})}
      inputRef={findRef}
      onClose={() => {
        run(setSearch(''));
        onClose();
        view?.focus();
      }}
    />
  );
}
