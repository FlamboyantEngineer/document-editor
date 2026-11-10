# Search

Finding and replacing text in a document: a plugin keeps the reader's query and its matches, and the document editor's find bar drives it.

## DOCE-SEARCH-1 - Finding

### DOCE-SEARCH-1.1 - Matches

`createSearch()` shall keep a query (`setSearch(query, { caseSensitive, wholeWord })`, out of the history) and its matches in every text block of the document, page headers and footers left out, ignoring case unless asked and matching whole words only when asked; each match is marked by a decoration carrying `data-search-match`, `current` for the current match and `match` otherwise. The first current match is the first at or after the selection, and the matches follow every change. An empty query clears them.

Implementation: `src/engine/search.ts`
Verification: `src/engine/search.test.ts`

### DOCE-SEARCH-1.2 - Moving between matches

`selectNextMatch` and `selectPreviousMatch` shall make the next or previous match current, wrapping around, select it and scroll it into view; both are refused without matches.

Implementation: `src/engine/search.ts`
Verification: `src/engine/search.test.ts`

### DOCE-SEARCH-1.3 - Replacing

`replaceMatch(replacement)` shall put the replacement in place of the current match, keeping its marks, and `replaceAllMatches(replacement)` in place of every match, as one change.

Implementation: `src/engine/search.ts`
Verification: `src/engine/search.test.ts`, `e2e/search.spec.ts`

## DOCE-SEARCH-2 - The find bar

### DOCE-SEARCH-2.1 - Finding in the editor

With `find`, Mod-F in the document shall open the base library's `FindBar` below the toolbar (`de-document-editor__find`, named by the `find` label), its box focused: it searches as the reader types, counts the matches and shows the current one, steps through them with Enter and Shift+Enter, offers matching case and whole words, and, while the writer can edit, Replace and Replace all. Closing it clears the matches and returns focus to the document. The editor installs the search plugin itself; its hidden measuring view does not search.

Implementation: `src/components/document-editor/document-find-bar.tsx`, `src/components/document-editor/document-editor.tsx`, `src/components/document-editor/use-document-layout.ts`, `labs/reference/editor-chrome.css`
Verification: `e2e/search.spec.ts`

## Hooks

| Hook                | Kind      | Values             | Description                                            |
| ------------------- | --------- | ------------------ | ------------------------------------------------------ |
| `data-search-match` | attribute | `current`, `match` | On the text of a match: whether it is the current one. |
