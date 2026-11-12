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

`save()` shall write the document in the stored format with its template pin and save it against the revision it was edited from, one save at a time, the save status going `saving` and then `saved`. A change made during a save stays to save. A refused save, such as a `conflict`, shall set the status to `error` with the host's error and keep the change to save again.

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

## DOCE-SESSION-5 - Unsaved changes

### DOCE-SESSION-5.1 - The unsaved-changes reader

`hasUnsavedChanges()` shall say whether the document has changes the store does not hold yet, for an unsaved-changes guard.

Implementation: `src/session/store-saving.ts`
Verification: `src/session/document-session.test.ts`

### DOCE-SESSION-5.2 - Leaving the page

When the host's `lifecycle` adapter says the page is hidden or being left, the session shall flush; a closed session saves nothing.

Implementation: `src/session/session-follow.ts`, `src/session/store-saving.ts`
Verification: `src/session/document-session.test.ts`, `e2e/session.spec.ts`

## DOCE-SESSION-6 - Drafts and offline

### DOCE-SESSION-6.1 - Keeping store-mode drafts

In store mode, while the document has unsaved changes, the session shall keep its content in the stored format, with its template pin and the revision it was edited from, through the host's `drafts` adapter once changes pause for `draftDelay` milliseconds (300 by default), so a reload or a crash does not lose it. Once a save leaves nothing unsaved, the session shall remove the draft.

Implementation: `src/session/drafts.ts`, `src/session/store-session.ts`, `src/session/store-saving.ts`
Verification: `src/session/drafts.test.ts`

### DOCE-SESSION-6.2 - Offering a draft

When a document opens and the `drafts` adapter holds a draft for it, the session's `draft` store shall offer it (`savedAt`, `outdated`) until it is restored or discarded, and no later change replaces the offered draft meanwhile. `restoreDraft()` shall show the draft's content and template in place of the stored ones, as a change to save.

Implementation: `src/session/drafts.ts`, `src/session/store-session.ts`
Verification: `src/session/drafts.test.ts`, `e2e/offline.spec.ts`

### DOCE-SESSION-6.3 - Drafts the store already holds

A draft whose content and template pin the store already holds, compared as DOCE-SESSION-2.1 compares them, shall not be offered, and the session shall remove it.

Implementation: `src/session/drafts.ts`
Verification: `src/session/drafts.test.ts`

### DOCE-SESSION-6.4 - Drafts from an older revision

A draft edited from an older revision than the store holds shall be offered as `outdated`. Once restored, it shall be saved against the revision it was edited from, so the store refuses it as a `conflict` rather than losing the newer save.

Implementation: `src/session/drafts.ts`, `src/session/store-saving.ts`
Verification: `src/session/drafts.test.ts`

### DOCE-SESSION-6.5 - Discarding a draft

`discardDraft()` shall end the offer and remove the draft, keeping the stored content.

Implementation: `src/session/store-session.ts`, `src/session/drafts.ts`
Verification: `src/session/drafts.test.ts`, `e2e/offline.spec.ts`

### DOCE-SESSION-6.6 - Drafts when the page goes away

When the host's `lifecycle` adapter says the page is hidden or being left, the session shall keep its draft at once, before it flushes, so a save that fails then still leaves the draft.

Implementation: `src/session/store-session.ts`, `src/session/drafts.ts`
Verification: `src/session/drafts.test.ts`

### DOCE-SESSION-6.7 - Keeping room-mode drafts

In room mode, `keepRoomDrafts` shall keep the shared document's draft through the `drafts` adapter after each change, local or remote, once changes pause (1000 milliseconds by default), when the room has confirmed every local change, and at once when the page is hidden or left: the document's state, the changes the room has not confirmed, the last state the room had confirmed all of (`confirmed`), and the room's generation.

Implementation: `src/collab/offline.ts`
Verification: `src/collab/offline.test.ts`

### DOCE-SESSION-6.8 - Replaying room-mode drafts

`restoreRoomDraft` shall apply a draft's state and unconfirmed changes to a new shared document as one merged update, which keeps causal order whatever order they were kept in (DOCE-COLLAB-4.6), and say whether Yjs integrated it whole. Handed to the connection as its unconfirmed update, the draft's local changes reach the room once it connects again, and `whenStored` resolves once the room has stored them.

Implementation: `src/collab/offline.ts`
Verification: `src/collab/offline.test.ts`
