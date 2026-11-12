# Session

A document session opens one document by id through the host and keeps its changes, with no framework: `createDocumentSession({ host, documentId, mode })`. It loads the document, the template it pins and the reader's capabilities, gives the editor its state, measures changes against what the store holds, saves them, and reports its status. Store mode loads and saves through the host's document store and never loads the realtime library (D27).

## DOCE-SESSION-1 - Loading and status

### DOCE-SESSION-1.1 - Opening a document

A session shall load the document by id from the host's document store, the template it pins at the revision it pins (`templates.load`), with the chain it inherits resolved, or the base template when it pins none, and the reader's capabilities (`permissions.capabilities`). Its `document` store shall then hold the editor state, the template, the pin, the capabilities and the editing mode they give, and its `status` store shall go from `loading` to `ready`. `ready` resolves true once the document is loaded.

Implementation: `src/session/document-session.ts`, `src/session/store-session.ts`, `src/session/open-document.ts`, `src/session/status.ts`, `src/session/value-store.ts`
Verification: `src/session/document-session.test.ts`

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

## DOCE-SESSION-2 - Changes and saving

### DOCE-SESSION-2.1 - The dirty baseline

The session shall measure each new document against the content the store holds. A change that only gives elements other ids or changes who wrote what (element ids, authorship attributes and contributor marks) shall leave it clean; any other change, or a new template pin, makes it dirty, with the save status `dirty`.

Implementation: `src/session/dirty.ts`, `src/session/store-saving.ts`
Verification: `src/session/document-session.test.ts`

### DOCE-SESSION-2.2 - Saving

`save()` shall write the document in the stored format with its template pin and save it against the revision it was edited from, one save at a time, the save status going `saving` and then `saved`. A change made during a save stays to save. A refused save, such as a `conflict`, shall set the status to `error` with the host's error and keep the change to save again.

Implementation: `src/session/store-saving.ts`
Verification: `src/session/document-session.test.ts`

### DOCE-SESSION-2.3 - Automatic saves

In store mode the session shall save by itself once changes pause for `autosaveDelay` milliseconds (1000 by default).

Implementation: `src/session/store-saving.ts`
Verification: `src/session/document-session.test.ts`

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

## DOCE-SESSION-5 - Unsaved changes

### DOCE-SESSION-5.1 - The unsaved-changes reader

`hasUnsavedChanges()` shall say whether the document has changes the store does not hold yet, for an unsaved-changes guard.

Implementation: `src/session/store-saving.ts`
Verification: `src/session/document-session.test.ts`

### DOCE-SESSION-5.2 - Leaving the page

When the host's `lifecycle` adapter says the page is hidden or being left, the session shall flush; a closed session saves nothing.

Implementation: `src/session/session-follow.ts`, `src/session/store-saving.ts`
Verification: `src/session/document-session.test.ts`
