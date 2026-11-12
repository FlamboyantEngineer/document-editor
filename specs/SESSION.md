# Session

A document session opens one document by id through the host and keeps its changes, with no framework: `createDocumentSession({ host, documentId, mode })`. It loads the document, the template it pins and the reader's capabilities, gives the editor its state, measures changes against what the store holds, saves them, and reports its status. Store mode loads and saves through the host's document store and never loads the realtime library (D27).

## DOCE-SESSION-1 - Loading and status

### DOCE-SESSION-1.1 - Opening a document

A session shall load the document by id from the host's document store, the template it pins at the revision it pins (`templates.load`), with the chain it inherits resolved, or the base template when it pins none, and the reader's capabilities (`permissions.capabilities`). Its `document` store shall then hold the editor state, the template, the pin, the capabilities and the editing mode they give, and its `status` store shall go from `loading` to `ready`. `ready` resolves true once the document is loaded.

Implementation: `src/session/document-session.ts`, `src/session/store-session.ts`, `src/session/open-document.ts`, `src/session/status.ts`, `src/session/value-store.ts`
Verification: `src/session/document-session.test.ts`, `e2e/session.spec.ts`

### DOCE-SESSION-1.2 - A document that cannot load

When the store, the template source or the stored format refuses the document, the session's status shall be `failed` with the host's error, its `document` store stays empty, and `ready` resolves false.

Implementation: `src/session/store-session.ts`, `src/session/open-document.ts`
Verification: `src/session/document-session.test.ts`

### DOCE-SESSION-1.3 - Closing

Aborting the session's `signal`, or `close()`, shall abort what it is loading, stop its automatic saves and stop following the host; `ready` then resolves false if the document had not loaded.

Implementation: `src/session/store-session.ts`, `src/session/store-saving.ts`
Verification: `src/session/document-session.test.ts`

### DOCE-SESSION-1.4 - Live capabilities

When the host tells the session of new capabilities (`permissions.subscribe`), the session's document shall take them and the editing mode they give (`resolveEditingMode`).

Implementation: `src/session/session-follow.ts`
Verification: `src/session/document-session.test.ts`

### DOCE-SESSION-1.5 - Template changes

When the host saves a revision of the pinned template newer than the pinned one (`templates.subscribe`), the session's document shall name it (`templateUpdate`), so the reader may move to it. `setTemplate(pin)` shall load and resolve another template or revision, show it, and count the new pin as a change to save.

Implementation: `src/session/session-follow.ts`, `src/session/store-session.ts`
Verification: `src/session/document-session.test.ts`

### DOCE-SESSION-1.6 - Sessions in React

`useDocumentSession(options)` shall open a session while its component is shown, and again when the host, the document id or the mode changes, closing the one before. `DocumentSessionBoundary` shall show its `fallback` while the document loads, `renderError(error)` when it cannot load, and otherwise render its children with the editor's props: the state and `onStateChange`, the template, `editable` and `suggesting` from the editing mode, the capabilities and the session, for a host to spread onto `DocumentEditor`. `useSessionValue(store)` renders again whenever a session store changes.

Implementation: `src/components/document-session/document-session.tsx`
Verification: `src/components/document-session/document-session.test.tsx`

## DOCE-SESSION-2 - Changes and saving

### DOCE-SESSION-2.1 - The dirty baseline

The session shall measure each new document against the content the store holds, compared in the stored format, so what the editor derives and does not store, such as heading levels, is no change. A change that only gives elements other ids or changes who wrote what (element ids, authorship attributes and contributor marks) shall leave it clean; any other change, or a new template pin, makes it dirty, with the save status `dirty`.

Implementation: `src/session/dirty.ts`, `src/session/store-saving.ts`
Verification: `src/session/document-session.test.ts`, `src/components/document-session/document-session.test.tsx`

### DOCE-SESSION-2.2 - Saving

`save()` shall write the document in the stored format with its template pin and save it against the revision it was edited from, one save at a time, the save status going `saving` and then `saved`. A change made during a save stays to save. A refused save shall set the status to `error` with the host's error and keep the change to save again; a save refused as `conflict` is then merged (DOCE-SESSION-4).

Implementation: `src/session/store-saving.ts`
Verification: `src/session/document-session.test.ts`, `e2e/session.spec.ts`

### DOCE-SESSION-2.3 - Automatic saves

In store mode the session shall save by itself once changes pause for `autosaveDelay` milliseconds (1000 by default).

Implementation: `src/session/store-saving.ts`
Verification: `src/session/document-session.test.ts`, `e2e/session.spec.ts`

### DOCE-SESSION-2.4 - No empty automatic saves

An automatic save or a flush shall not save a document with no content over a stored document that has some; the change stays unsaved until `save()` keeps it.

Implementation: `src/session/store-saving.ts`
Verification: `src/session/document-session.test.ts`

### DOCE-SESSION-2.5 - Flushing

`flush()` shall save what is unsaved at once, as an automatic save does, wait for a save in flight, and resolve true once nothing is left unsaved.

Implementation: `src/session/store-saving.ts`
Verification: `src/session/document-session.test.ts`

## DOCE-SESSION-3 - Modes

### DOCE-SESSION-3.1 - Store mode without the realtime library

A store-mode session, and everything the session entry loads when it loads, shall import no realtime library.

Implementation: `src/session/index.ts`
Verification: `src/session/store-bundle.test.ts`

## DOCE-SESSION-4 - Merging another writer's saves

In store mode two readers can edit the same stored document. When a save is refused as `conflict`, or the store tells of a save made elsewhere (DOCE-SESSION-7), the session merges the reader's unsaved changes into the stored document (D28) rather than asking the reader to choose a whole document.

### DOCE-SESSION-4.1 - Three-way merge by element id

`mergeDocuments({ base, mine, theirs })` shall merge two stored documents edited from the same base by element id: a block only one side changed, inserted or deleted takes that side's change; a container both sides changed, such as a section, a list or a table, merges its own settings and then its children the same way; blocks either side inserted are placed after the block before them on that side; and the order follows the side that moved blocks, the reader's when both did. The template pin merges the same way, the reader's winning when both changed it. When a save conflicts (`HostError.current`, or the stored document loaded again when the host gives none), the session shall show the merged document, take the stored document as its new baseline and save the merge against it, with no prompt when no block conflicts. The caret and the blocks that did not change stay as they were (DOCE-SESSION-7.2).

Implementation: `src/session/merge.ts`, `src/session/store-refresh.ts`, `src/session/store-saving.ts`
Verification: `src/session/merge.test.ts`, `src/session/store-refresh.test.ts`, `e2e/session.spec.ts`

### DOCE-SESSION-4.2 - Conflicts

A block both sides changed differently, or one side deleted while the other changed it, shall be a conflict (`MergeConflict`: its id, the reader's version and the stored one, null for a deletion). The merged document shows the reader's version, or the changed one over a deletion. While conflicts remain, the session's `conflicts` store lists them, its status is `error` with a `conflict` error, and it does not save, so `flush()` resolves false. `resolveConflict(id, choice)` settles one: `mine` keeps the reader's block as it is now, `theirs` puts the stored one in its place, a deletion on the chosen side removing it, and `both` (for two blocks with text, `canKeepBoth`) keeps the reader's block with the stored one after it under new element ids (`resolveMergeConflict`). Once none remains, the session saves again.

Implementation: `src/session/merge.ts`, `src/session/merge-conflicts.ts`, `src/session/store-refresh.ts`, `src/session/store-saving.ts`
Verification: `src/session/merge.test.ts`, `src/session/store-refresh.test.ts`

### DOCE-SESSION-4.3 - The conflict prompt

`MergeConflicts` shall show, for a session's conflicts, one warning per block, titled by whether both changed it or one deleted it, with the word changes from the reader's text to the stored one (`InlineTextDiff`) and a group of buttons, named by the title, to keep mine, keep theirs and, where both hold text, keep both. It renders nothing while there is no conflict. Its text comes from `labels`.

Implementation: `src/components/document-session/merge-conflicts.tsx`
Verification: `src/components/document-session/merge-conflicts.test.tsx`, `e2e/session.spec.ts`

## DOCE-SESSION-5 - Unsaved changes

### DOCE-SESSION-5.1 - The unsaved-changes reader

`hasUnsavedChanges()` shall say whether the document has changes the store does not hold yet, for an unsaved-changes guard.

Implementation: `src/session/store-saving.ts`
Verification: `src/session/document-session.test.ts`

### DOCE-SESSION-5.2 - Leaving the page

When the host's `lifecycle` adapter says the page is hidden or being left, the session shall flush; a closed session saves nothing.

Implementation: `src/session/session-follow.ts`, `src/session/store-saving.ts`
Verification: `src/session/document-session.test.ts`, `e2e/session.spec.ts`

## DOCE-SESSION-7 - Refreshing from the store

### DOCE-SESSION-7.1 - Following the store's saves

When the host's document store tells of a save (`documents.subscribe`) newer than the one the session holds, the session shall wait for its own save in flight, load the stored document and take it in: shown as it is when the reader has no unsaved changes, merged with them otherwise (DOCE-SESSION-4), and taken as the new baseline. Its own saves are not taken in again.

Implementation: `src/session/store-refresh.ts`
Verification: `src/session/store-refresh.test.ts`, `e2e/session.spec.ts`

### DOCE-SESSION-7.2 - Replacing the content in place

`replaceDocumentContent(state, doc)` shall give a transaction that turns the state's document into `doc` by changing only the blocks, matched by element id, and the runs of text that differ, so the selection and every unchanged block stay. Page headers and footers are left for the section plugins to derive. The transaction is a system change (`markSystemChange`) outside the history.

Implementation: `src/engine/replace-document-content.ts`
Verification: `src/engine/replace-document-content.test.ts`, `src/session/store-refresh.test.ts`

## Hooks

| Hook                           | Kind      | Values               | Description                                        |
| ------------------------------ | --------- | -------------------- | -------------------------------------------------- |
| `de-merge-conflicts`           | root      |                      | The conflict prompt (DOCE-SESSION-4.3).            |
| `de-merge-conflicts__conflict` | slot      |                      | One block's warning.                               |
| `data-kind`                    | attribute | `changed`, `deleted` | On a conflict: both changed it, or one deleted it. |
