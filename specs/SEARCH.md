# Search

Finding and replacing text in a document. Two searches run side by side, each a plugin with its own state: the find bar's and the search pane's. Each keeps the reader's query and its matches, so the find bar and the pane never show each other's search.

## DOCE-SEARCH-1 - Finding

### DOCE-SEARCH-1.1 - Matches

`createSearch()` shall keep a query (`setSearch(query, { caseSensitive, wholeWord })`, out of the history) and its matches in every text block of the document, page headers and footers left out, an inline node read as the text it shows (DOCE-SEARCH-1.6) and matched whole, ignoring case unless asked and matching whole words only when asked; each match is marked by a decoration carrying `data-search-match`, `current` for the current match and `match` otherwise. The first current match is the first at or after the selection, and the matches follow every change. An empty query clears them.

Implementation: `src/engine/search.ts`, `src/engine/search-text.ts`
Verification: `src/engine/search.test.ts`, `src/engine/host-domain-recipe.test.ts`

### DOCE-SEARCH-1.2 - Moving between matches

`selectNextMatch` and `selectPreviousMatch` shall make the next or previous match current, wrapping around, select it and scroll it into view; both are refused without matches.

Implementation: `src/engine/search.ts`
Verification: `src/engine/search.test.ts`

### DOCE-SEARCH-1.3 - Replacing

`replaceMatch(replacement)` shall put the replacement in place of the current match, keeping its marks, and put the caret after it; `replaceAllMatches(replacement)` puts it in place of every match, as one change.

Implementation: `src/engine/search.ts`
Verification: `src/engine/search.test.ts`, `e2e/search.spec.ts`

### DOCE-SEARCH-1.4 - Locked content

A match in locked content (DOCE-EDITING-4.1) shall stay found but never be replaced: `replaceMatch` refuses it, and `replaceAllMatches` replaces the others and is refused when only locked matches remain. Each replacement closes its own undo step.

Implementation: `src/engine/search.ts`
Verification: `src/engine/search.test.ts`

### DOCE-SEARCH-1.5 - Two searches

`createSearch('pane')` shall keep the search pane's search apart from the find bar's (`createSearch()`, the `find` scope): its own query, options, matches and current match, set, revealed and replaced by the same commands given the `pane` scope (`setSearch(query, options, 'pane')`, `replaceMatch(replacement, 'pane')`, `replaceAllMatches(replacement, 'pane')`), and marked by decorations carrying `data-search-result` instead of `data-search-match`. A change to one search never changes the other's query or current match. Replacing from the pane leaves the selection where it was. The editor installs both; its hidden measuring view runs neither.

Implementation: `src/engine/search.ts`, `src/components/document-editor/use-document-layout.ts`, `src/components/document-editor/start-paging.ts`
Verification: `src/engine/search.test.ts`, `e2e/search.spec.ts`

### DOCE-SEARCH-1.6 - Inline nodes

An inline node shall be searched as the text it shows: its `leafText`, the text it holds, such as a template variable's value, or the text its rendering writes, such as a mention's `@` and name; one object character when it shows none. A match that covers any part of an inline node covers all of it, and is found but never replaced (`isMatchReplaceable`): `replaceMatch` refuses it and `replaceAllMatches` leaves it.

Implementation: `src/engine/search-text.ts`
Verification: `src/engine/search.test.ts`

### DOCE-SEARCH-1.7 - Seeding from the selection

`searchSeed(state)` shall give the text the selection holds in one text block, inline nodes read as the text they show, as the query a search starts with; null for an empty selection, a selection across blocks, a blank one or one longer than 200 characters.

Implementation: `src/engine/search-text.ts`
Verification: `src/engine/search.test.ts`

## DOCE-SEARCH-2 - The find bar

### DOCE-SEARCH-2.1 - Finding in the editor

With `find`, the editor shall show the base library's `FindBar` below the toolbar (`de-document-editor__find`, named by the `find` label) when asked (DOCE-SEARCH-2.2): it searches as the reader types, counts the matches and shows the current one, steps through them with Enter and Shift+Enter, offers matching case and whole words, and, while the writer can edit, Replace and Replace all, each disabled while no match it would change may be replaced (DOCE-SEARCH-1.4, DOCE-SEARCH-1.6). It takes focus only when asked to show, never as the document changes, so the writer can go on typing in the document. Its query and options are the find bar's search (DOCE-SEARCH-1.5), which a host may also set, apart from the search pane's. Closing it clears its matches and returns focus to the document.

Implementation: `src/components/document-editor/document-find-bar.tsx`, `src/components/document-editor/editor-chrome.tsx`, `src/utils/search-options.ts`, `labs/reference/editor-chrome.css`
Verification: `src/components/document-editor/document-find-bar.test.tsx`, `e2e/search.spec.ts`

### DOCE-SEARCH-2.2 - Opening the find bar

Mod-F anywhere in the editor, in the document, the toolbar, a side panel or the find bar itself, shall show the find bar with its find box focused and its text selected, and Mod-H shows it with its replacement box focused while the writer can edit, its find box otherwise; a key something inside the editor already handled is left alone, as the search pane takes Mod-F and Mod-H to its own boxes. Opening seeds the find bar's search with the selected text (DOCE-SEARCH-1.7), keeping its options. The menubar's Find and the handle's `openFind(mode)` (`find` or `replace`) open it the same way; `openFind` returns false while the editor has no find bar.

Implementation: `src/components/document-editor/document-find-bar.tsx`, `src/components/document-editor/document-editor.tsx`, `src/components/document-editor/editor-handle.ts`, `src/components/document-editor/use-editor-engine.ts`
Verification: `src/components/document-editor/document-find-bar.test.tsx`, `e2e/search.spec.ts`

## DOCE-SEARCH-3 - The search pane

### DOCE-SEARCH-3.1 - Results

`searchResults(state, { scope, template })` shall give each match of a search, the find bar's by default, in the text of its block as search reads it, where it starts and ends there, under the heading it is under (its number, as the template numbers it, and its text), and whether the writer may replace it, placing every match in one walk through the headings. `revealMatchAt(index, scope)` makes a match current and scrolls it into the middle of the view, leaving the selection where it was.

Implementation: `src/engine/search-results.ts`, `src/engine/search.ts`
Verification: `src/engine/search.test.ts`

### DOCE-SEARCH-3.2 - The pane

`DocumentSearchPane`, inside an editor or given its context, shall search the document as the base library's `SearchPane`, with the search pane's own search (DOCE-SEARCH-1.5): the query, named by the `searchDocument` label, with matching case and whole words, searched 250 ms after the reader stops typing (`pending` meanwhile), the results with their heading as label, the current one revealed in the document without moving the caret as the reader steps or picks one, and, while the writer can edit, Replace, disabled on a match the writer may not replace, and Replace all, which announces how many matches it replaced (the `replacedCount` label) through an announcer of its own. Closing it clears its search. The find bar and the pane show apart, so both may be open at once, each with its own matches.

Implementation: `src/components/document-panels/document-search-pane.tsx`, `src/components/document-editor/editor-labels.ts`, `src/utils/search-options.ts`
Verification: `src/components/document-panels/document-search-pane.test.tsx`, `e2e/document-panels.spec.ts`, `e2e/search.spec.ts`

## Hooks

| Hook                 | Kind      | Values             | Description                                                        |
| -------------------- | --------- | ------------------ | ------------------------------------------------------------------ |
| `data-search-match`  | attribute | `current`, `match` | On the text of a find bar match: whether it is the current one.    |
| `data-search-result` | attribute | `current`, `match` | On the text of a search pane match: whether it is the current one. |
