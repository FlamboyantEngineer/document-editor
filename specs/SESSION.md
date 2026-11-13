# Session

A document session opens one document by id through the host and keeps its changes, with no framework: `createDocumentSession({ host, documentId, mode })`. It loads the document, the template it pins and the reader's capabilities, gives the editor its state, keeps its changes, and reports its status. Store mode loads and saves through the host's document store, measuring changes against what the store holds, and never loads the realtime library (D27). Room mode opens the document in its shared room through the host's `collaboration` adapter, and the room keeps it.

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

Implementation: `src/session/index.ts`, `src/session/room-open.ts`, `src/session/room-binding.ts`
Verification: `src/session/store-bundle.test.ts`

### DOCE-SESSION-3.2 - Opening a document in its room

A room-mode session shall connect the document's room through the host's `collaboration` adapter, loading the realtime library only then, with the reader's room draft (`drafts`) when there is one, and the reader's capabilities. Its status shall go from `connecting` to `syncing` and, once the connection first synced, to `ready`; with a draft it shall be ready at once, without waiting for the sync. Its `document` store shall hold the content the room holds, the template the room's `meta` type pins, and an editor state that runs the room's sync plugin with no undo history of its own, so every reader of the room edits the same document. A host without rooms, a refused connection or a template that cannot load shall make the status `failed` with the error, and `ready` resolve false.

Implementation: `src/session/room-session.ts`, `src/session/room-open.ts`, `src/session/room-binding.ts`, `src/session/store-session.ts`
Verification: `src/session/room-session.test.ts`

### DOCE-SESSION-3.3 - The room's status

A room-mode session's save status shall follow the connection's state: `offline` while disconnected, `saving` while the room has not confirmed a local change or is storing, `dirty` while the room holds changes it has not stored, `saved` once it stored them, and `idle` before it says; a refusal shall make it `error`, a room of another generation as a `conflict`. The document is dirty, and `hasUnsavedChanges()` true, while the room has not confirmed a local change. `save()` and `flush()` shall wait until the room has stored every change made so far, or the connection is lost, and `flush()` resolve whether nothing is left unconfirmed.

Implementation: `src/session/room-status.ts`, `src/session/room-session.ts`, `src/session/room-open.ts`
Verification: `src/session/room-status.test.ts`, `src/session/room-session.test.ts`

### DOCE-SESSION-3.4 - The connection's gate

The document's capabilities shall be those the host grants, narrowed by the gate of the connection's phase (`connectionGate`, `gateCapabilities`, DOCE-COLLAB-5.2), and its editing mode the one they give, again whenever the phase or the granted capabilities change. A document opened on a draft, or that has synced, stays editable while the connection reconnects or is offline; one that has not stays read-only until the first sync; a read-only connection allows comments only; a refused connection or a room of another generation locks every surface.

Implementation: `src/session/room-follow.ts`, `src/session/session-follow.ts`, `src/session/room-session.ts`
Verification: `src/session/room-session.test.ts`

### DOCE-SESSION-3.5 - The room's template

`setTemplate(pin)` in room mode shall show the template and write the pin to the room's `meta` type, for a reader who edits; when another reader pins another template, the session shall show it.

Implementation: `src/session/room-session.ts`, `src/session/room-binding.ts`
Verification: `src/session/room-session.test.ts`

### DOCE-SESSION-3.6 - Closing a room session

Closing a room-mode session shall end its connection, also when it closes while connecting.

Implementation: `src/session/room-session.ts`, `src/session/room-open.ts`
Verification: `src/session/room-session.test.ts`

### DOCE-SESSION-3.7 - Room providers

`roomConnection(provider)` (`./collab`) shall give a room provider, such as collaboration-tools', as the connection a collaboration adapter returns: its document, awareness, state and receipts; `whenSynced` resolving at the first sync and rejecting on a refusal or a close; and `close()` destroying the provider.

Implementation: `src/collab/room-connection.ts`
Verification: `src/session/room-session.test.ts`

### DOCE-SESSION-3.8 - The connection's phase

A session's `connection` store shall hold the room connection's phase (`connectionPhase`, DOCE-COLLAB-5.1) and its gate, for a connection status: `connecting` with nothing editable until the session connects, then the phase as the connection's state changes. It shall hold null in store mode.

Implementation: `src/session/room-follow.ts`, `src/session/room-session.ts`, `src/session/store-session.ts`
Verification: `src/session/room-session.test.ts`

### DOCE-SESSION-3.9 - Presence in the room

A room-mode session's editor state shall run the presence plugins on the room's awareness (`createPresence`, `createAwarenessPresence`, DOCE-COLLAB-1.5), with the reader as the host's identity names them and the host's page lifecycle, so each reader sees the others' carets and selections.

Implementation: `src/session/room-binding.ts`, `src/session/room-open.ts`
Verification: `src/session/room-session.test.ts`

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

## DOCE-SESSION-6 - Drafts and offline

### DOCE-SESSION-6.1 - Keeping store-mode drafts

In store mode, while the document has unsaved changes, the session shall keep its content in the stored format, with its template pin and the revision it was edited from, through the host's `drafts` adapter once changes pause for `draftDelay` milliseconds (300 by default), so a reload or a crash does not lose it. Once a save leaves nothing unsaved, the session shall remove the draft.

Implementation: `src/session/drafts.ts`, `src/session/store-session.ts`
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

A draft edited from an older revision than the store holds shall be offered as `outdated`. Once restored, it shall be saved against the revision it was edited from, with that revision's content (`versions.load`) as its base, so the store refuses it as a `conflict` and the session merges it into the newer save (DOCE-SESSION-4) rather than losing either; blocks both changed wait for the reader.

Implementation: `src/session/drafts.ts`
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

In room mode, `keepRoomDrafts` shall keep the shared document's draft through the `drafts` adapter after each change, local or remote, once changes pause (1000 milliseconds by default), when the room has confirmed every local change, and at once when the page is hidden or left: the document's state, the changes the room has not confirmed, the last state the room had confirmed all of (`confirmed`), taken as soon as the room confirms, and the room's generation.

Implementation: `src/collab/offline.ts`
Verification: `src/collab/offline.test.ts`

### DOCE-SESSION-6.8 - Replaying room-mode drafts

`restoreRoomDraft` shall apply a draft's state and unconfirmed changes to a new shared document as one merged update, which keeps causal order whatever order they were kept in (DOCE-COLLAB-4.6), and say whether Yjs integrated it whole. Handed to the connection as its unconfirmed update, the draft's local changes reach the room once it connects again, and `whenStored` resolves once the room has stored them.

Implementation: `src/collab/offline.ts`
Verification: `src/collab/offline.test.ts`

### DOCE-SESSION-6.9 - Merging a room draft into a new generation

When a shared room has started a new generation since a draft was kept, `mergeRoomDraft` shall merge what the draft holds beyond the last state the room confirmed into the new generation's document, by element id (DOCE-SESSION-4): a block only the draft changed takes the draft's version, as one change the binding sends to the room. A block both changed, or one changed and the other removed, keeps the new generation's version and is reported as a leftover with the draft's version. A draft with no unconfirmed changes merges nothing, and a draft with no confirmed state reports every block that differs.

Implementation: `src/collab/offline.ts`
Verification: `src/collab/offline.test.ts`

### DOCE-SESSION-6.10 - Room-mode drafts in a session

A room-mode session shall open on the room's draft when the host keeps one, so the reader edits with no connection, and send the draft's unconfirmed changes once it connects. While connected, it shall keep the room's draft (DOCE-SESSION-6.7) and stop keeping it when closed. When the room refuses the draft for belonging to an older generation, the session shall open the room again without it and merge the draft into the new generation's document (DOCE-SESSION-6.9), sending the merge to the room, through the editor when one is bound; its leftovers are the session's `conflicts`, and the draft stays kept until they are settled. `resolveConflict` settles a leftover in the room's document: `mine` puts the draft's version in its place, `theirs` keeps the room's, and `both` keeps the room's with the draft's after it under new ids. The offline module, and with it the realtime library, loads only when the session needs it (DOCE-SESSION-3.1).

Implementation: `src/session/room-drafts.ts`, `src/session/room-session.ts`, `src/session/room-open.ts`
Verification: `src/session/room-drafts.test.ts`, `e2e/offline.spec.ts`

## DOCE-SESSION-7 - Refreshing from the store

### DOCE-SESSION-7.1 - Following the store's saves

When the host's document store tells of a save (`documents.subscribe`) newer than the one the session holds, the session shall wait for its own save in flight, load the stored document and take it in: shown as it is when the reader has no unsaved changes, merged with them otherwise (DOCE-SESSION-4), and taken as the new baseline. Its own saves are not taken in again.

Implementation: `src/session/store-refresh.ts`
Verification: `src/session/store-refresh.test.ts`, `e2e/session.spec.ts`

### DOCE-SESSION-7.2 - Replacing the content in place

`replaceDocumentContent(state, doc)` shall give a transaction that turns the state's document into `doc` by changing only the blocks, matched by element id, and the runs of text that differ, so the selection and every unchanged block stay. An inline node that holds text, such as an equation, whose text differs is replaced whole, never in part. Page headers and footers are left for the section plugins to derive. The transaction is a system change (`markSystemChange`) outside the history.

Implementation: `src/engine/replace-document-content.ts`
Verification: `src/engine/replace-document-content.test.ts`, `src/session/store-refresh.test.ts`

## DOCE-SESSION-9 - Status UI

### DOCE-SESSION-9.1 - Save status

With a `session`, the editor's status bar shall show where the session's changes stand (`status.save`, the same in room and store mode) in the base library's `SaveStatus`, as a status item with `data-status="save"`: unsaved, saving, saved, offline, or failed with the reason the session gives (`status.error.message`) and a Retry button that asks the session to save again. A failed retry shows in the status again. Without a session the bar shows no save item.

Implementation: `src/components/document-editor/save-status-item.tsx`, `src/components/document-editor/document-status-bar.tsx`, `src/components/document-editor/document-editor.tsx`
Verification: `src/components/document-editor/save-status-item.test.tsx`

### DOCE-SESSION-9.2 - Save shortcut

With a `session`, the shortcut table's `save` keys (Mod-s by default, remapped through the editing's `shortcuts`) pressed anywhere in the editor, its chrome included, shall save the session in place of the browser's own save. Other keys, such as Mod-Shift-s, are left alone.

Implementation: `src/components/document-editor/save-status-item.tsx`, `src/components/document-editor/document-editor.tsx`, `src/engine/shortcuts.ts`
Verification: `src/components/document-editor/save-status-item.test.tsx`

### DOCE-SESSION-9.3 - Deciding suggestions

The editor shall offer accepting and rejecting suggestions, in the comments margin and the context menu, only while the reader edits without suggesting and their `capabilities` include `decide`. Without `capabilities` the editor assumes every capability.

Implementation: `src/components/document-editor/save-status-item.tsx`, `src/components/document-editor/editor-chrome.tsx`, `src/components/document-editor/editor-body.tsx`
Verification: `src/components/document-editor/save-status-item.test.tsx`

### DOCE-SESSION-9.4 - Load progress

`SessionLoading` shall show the base library's `LoadingOverlay` while the session opens its document, naming the phase it is in (`connecting`, `loading` or `syncing`, by `DEFAULT_SESSION_LOADING_LABELS` or the host's `labels`), after the host's `delay` when given, and nothing once the document is ready or failed. It is meant as a `DocumentSessionBoundary` fallback.

Implementation: `src/components/document-session/save-status.tsx`
Verification: `src/components/document-session/save-status.test.tsx`, `e2e/session.spec.ts`

### DOCE-SESSION-9.5 - Load telemetry

`useSessionTelemetry(session, telemetry)` shall measure through the host's telemetry how long each load phase took (`SESSION_MEASURES.connecting`, `loading`, `syncing`) and the whole load once the document is ready (`SESSION_MEASURES.load`), each attributed with the session's `mode`. A session already open when the hook starts, or whose load failed, gives no whole-load measure.

Implementation: `src/components/document-session/save-status.tsx`
Verification: `src/components/document-session/save-status.test.tsx`

### DOCE-SESSION-9.6 - Unsaved-changes guard

`useSessionGuard(session, label)` shall register the session's unsaved changes (`status.dirty`) with the nearest base library `UnsavedChangesGuard`, named by `label`: leaving while the document is dirty asks the reader to save or stay, Save saves the session, and a save that leaves changes unsaved keeps the reader where they are.

Implementation: `src/components/document-session/save-status.tsx`
Verification: `src/components/document-session/save-status.test.tsx`, `e2e/session.spec.ts`

### DOCE-SESSION-9.7 - Connection status

With a `session` in room mode, the editor's status bar shall show where the room connection is (`session.connection`) in `ConnectionStatus` (DOCE-COLLAB-5.3), as a status item with `data-status="connection"` just before the save item, following each phase as it changes, in the words of the editor's `connectionStatus` label (by default `CONNECTION_STATUS_LABELS`). In store mode, where the session gives no connection or a null one, the item shows nothing.

Implementation: `src/components/document-editor/save-status-item.tsx`, `src/components/document-editor/document-status-bar.tsx`
Verification: `src/components/document-editor/save-status-item.test.tsx`, `e2e/session-room.spec.ts`

## Hooks

| Hook                           | Kind      | Values               | Description                                        |
| ------------------------------ | --------- | -------------------- | -------------------------------------------------- |
| `de-merge-conflicts`           | root      |                      | The conflict prompt (DOCE-SESSION-4.3).            |
| `de-merge-conflicts__conflict` | slot      |                      | One block's warning.                               |
| `data-kind`                    | attribute | `changed`, `deleted` | On a conflict: both changed it, or one deleted it. |
