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

Aborting the session's `signal`, or `close()`, shall abort what it is loading, stop its automatic saves and stop following the host; `ready` then resolves false if the document had not loaded. A session made with a signal aborted already shall open nothing, its `ready` resolving false, and closing shall remove the listener it put on the signal.

Implementation: `src/session/store-session.ts`, `src/session/room-session.ts`, `src/session/store-saving.ts`
Verification: `src/session/document-session.test.ts`, `src/session/room-session.test.ts`

### DOCE-SESSION-1.4 - Live capabilities

When the host tells the session of new capabilities (`permissions.subscribe`), the session's document shall take them and the editing mode they give (`resolveEditingMode`). When the session is still opening, the latest capability event takes precedence over the initial lookup, in store and room mode.

Implementation: `src/session/session-follow.ts`, `src/session/store-session.ts`, `src/session/room-session.ts`
Verification: `src/session/document-session.test.ts`, `src/session/room-session.test.ts`, `e2e/session-room.spec.ts`

### DOCE-SESSION-1.5 - Template changes

When the host saves a revision of the pinned template newer than the pinned one (`templates.subscribe`), the session's document shall name it (`templateUpdate`), so the reader may move to it. `setTemplate(pin)` shall load and resolve another template or revision, show it, and count the new pin as a change to save. Of changes asked for in quick succession, as a reader's choice and another writer's pin, the last asked for shows, whichever load ends last; the others resolve false. When a store refresh or room reload changes the pin, the session shall show the resolved template with the new pin, reset the update notice and follow saves of the newly pinned template.

Implementation: `src/session/session-follow.ts`, `src/session/template-change.ts`, `src/session/store-session.ts`, `src/session/store-refresh.ts`, `src/session/room-reload.ts`
Verification: `src/session/document-session.test.ts`, `src/session/store-refresh.test.ts`, `src/session/room-reload.test.ts`, `e2e/session.spec.ts`

### DOCE-SESSION-1.6 - Sessions in React

`useDocumentSession(options)` shall open a session while its component is shown, and again when the host, the document id or the mode changes, closing the one before. `DocumentSessionBoundary` shall show its `fallback` while the document loads, `renderError(error)` when it cannot load, and otherwise render its children with the editor's props: the state and `onStateChange`, the template, `editable` and `suggesting` from the editing mode, the reader as `author` (`session.author`, the host's current person), so their suggestions are attributed to them, the capabilities and the session, for a host to spread onto `DocumentEditor`. `useSessionValue(store)` renders again whenever a session store changes.

Implementation: `src/components/document-session/document-session.tsx`
Verification: `src/components/document-session/document-session.test.tsx`

## DOCE-SESSION-2 - Changes and saving

### DOCE-SESSION-2.1 - The dirty baseline

The session shall measure each new document against the content the store holds, compared in the stored format, so what the editor derives and does not store, such as heading levels, is no change. A change that only gives elements other ids or changes who wrote what (element ids, authorship attributes and contributor marks) shall leave it clean; but when the stored document has elements without a valid id of their own, the change that repairs them (`repairElementIds`, which the editor runs with `repairIds`, DOCE-EDITING-1.4) makes it dirty, so the repair is saved once and every later opening reads the same ids; any other change, a new template pin, or a change of the document's language or of its variables' texts alone (DOCE-FORMAT-1.7), such as the texts a writer's editor stores on opening a file stored without them, makes it dirty, with the save status `dirty`; the texts compare whatever order their keys were stored in. A save measures the document again first: one changed back to what the store holds is clean, saved with the status `saved` and without asking the store. A footnote's element id is its `elementId`; its `id`, the footnote's own, is content.

Implementation: `src/session/dirty.ts`, `src/session/store-saving.ts`
Verification: `src/session/dirty.test.ts`, `src/session/document-session.test.ts`, `src/components/document-session/document-session.test.tsx`

### DOCE-SESSION-2.2 - Saving

`save()` shall write the document in the stored format with its template pin and save it against the revision it was edited from, one save at a time, the save status going `saving` and then `saved`. A change made during a save stays to save. A refused save shall set the status to `error` with the host's error and keep the change to save again; a save refused as `conflict` is then merged (DOCE-SESSION-4).

Implementation: `src/session/store-saving.ts`
Verification: `src/session/document-session.test.ts`, `e2e/session.spec.ts`

### DOCE-SESSION-2.3 - Automatic saves

In store mode the session shall save by itself once changes pause for `autosaveDelay` milliseconds (1000 by default).

Implementation: `src/session/store-saving.ts`, `src/utils/trailing-timer.ts`
Verification: `src/session/document-session.test.ts`, `e2e/session.spec.ts`, `src/utils/trailing-timer.test.ts`

### DOCE-SESSION-2.4 - No empty automatic saves

An automatic save or a flush shall not save a document with no content over a stored document that has some; the change stays unsaved until `save()` keeps it.

Implementation: `src/session/store-saving.ts`
Verification: `src/session/document-session.test.ts`

### DOCE-SESSION-2.5 - Flushing

`flush()` shall save what is unsaved at once, as an automatic save does, wait for a save in flight, and resolve true once nothing is left unsaved. When the store refuses the save for another writer's and the two merge with no conflict (DOCE-SESSION-4.1), the flush shall save the merge too, making up to three saves while other saves keep arriving.

Implementation: `src/session/store-saving.ts`
Verification: `src/session/document-session.test.ts`, `src/session/store-refresh.test.ts`

### DOCE-SESSION-2.6 - Edits held back by the editor

`holdPendingEdits(commit)` shall add a commit of what the editor or the host holds outside the document until the writer commits it, such as a field being typed in, and return its release. The session runs every held commit before it reads the document to save it, by a save, an automatic save or a flush, before a version is taken (which flushes first), before another writer's save is merged with the reader's changes, and, in room mode, before a flush, so what the session keeps holds what the writer typed.

Implementation: `src/session/pending-edits.ts`, `src/session/store-session.ts`, `src/session/store-refresh.ts`, `src/session/room-session.ts`
Verification: `src/session/document-session.test.ts`

## DOCE-SESSION-3 - Modes

### DOCE-SESSION-3.1 - Store mode without the realtime library

A store-mode session, and everything the session entry loads when it loads, shall import no realtime library.

Implementation: `src/session/index.ts`, `src/session/room-open.ts`, `src/session/room-binding.ts`
Verification: `src/session/store-bundle.test.ts`

### DOCE-SESSION-3.2 - Opening a document in its room

A room-mode session shall connect the document's room through the host's `collaboration` adapter, loading the realtime library only then, with the reader's room draft (`drafts`) when there is one, and the reader's capabilities. Its status shall go from `connecting` to `syncing` and, once the connection first synced, to `ready`; with a draft it shall be ready at once, without waiting for the sync. Its `document` store shall hold the content the room holds, the template the room's `meta` type pins, and an editor state that runs the room's sync plugin with no undo history of its own, so every reader of the room edits the same document. If the connection replaces its shared document while the template is loading, the session shall open with the replacement's content, template pin and binding. A change made through `update` while no editor is bound to the state shall be made on the content the room holds by then and written to the room, as a bound editor's changes are; the first content written into an empty room is sent as a local change, and a whole state given then is written only while the room still holds the content the session showed. A host without rooms, a refused connection, a template that cannot load or a room whose content the schema cannot read shall make the status `failed` with the error, and `ready` resolve false.

Implementation: `src/session/room-session.ts`, `src/session/room-open.ts`, `src/session/room-binding.ts`, `src/session/store-session.ts`
Verification: `src/session/room-session.test.ts`, `src/session/room-reload.test.ts`

### DOCE-SESSION-3.3 - The room's status

A room-mode session's save status shall follow the connection's state: `offline` while disconnected, `saving` while the room has not confirmed a local change or is storing, `dirty` while the room holds changes it has not stored, `saved` once it stored them, and `idle` before it says; a refusal shall make it `error`, a room of another generation as a `conflict`. The document is dirty, and `hasUnsavedChanges()` true, while the room has not confirmed a local change. `save()` and `flush()` shall wait until the room has stored every change made so far, or the connection is lost, and `flush()` resolve whether nothing is left unconfirmed.

Implementation: `src/session/room-status.ts`, `src/session/room-session.ts`, `src/session/room-open.ts`
Verification: `src/session/room-status.test.ts`, `src/session/room-session.test.ts`

### DOCE-SESSION-3.4 - The connection's gate

The document's capabilities shall be those the host grants, narrowed by the gate of the connection's phase (`connectionGate`, `gateCapabilities`, DOCE-COLLAB-5.2), and its editing mode the one they give, again whenever the phase or the granted capabilities change. A document opened on a draft, or that has synced, stays editable while the connection reconnects or is offline; one that has not stays read-only until the first sync; a read-only connection allows comments only; a refused connection or a room of another generation locks every surface. So does a room that comes to hold what the editor's schema cannot read (DOCE-COLLAB-4.7), whose error is the status's from then on, whatever the connection's phase.

Implementation: `src/session/room-follow.ts`, `src/session/session-follow.ts`, `src/session/room-session.ts`
Verification: `src/session/room-session.test.ts`

### DOCE-SESSION-3.5 - The room's template

`setTemplate(pin)` in room mode shall show the template and, for a reader who edits, write the pin to the room's `meta` type together with the room's content moved to the template (the sections the template owns brought in line with it and the references formatted by it, `moveToTemplate`), in one change of the room, so no reader ever holds the new pin without the moved content or the moved content without the pin. Before publishing a loaded template, the session shall check that its room binding is still current and that the reader can still edit. If either check fails, the pending request shall resolve false. The session shall show a template another reader pins even in read-only mode. A local switch without a mounted editor shall show the moved content with the pin in the same session update and keep the selection with its text (DOCE-SESSION-3.11).

Implementation: `src/session/room-session.ts`, `src/session/template-change.ts`, `src/session/room-selection.ts`, `src/session/room-binding.ts`, `src/engine/template-move.ts`
Verification: `src/session/room-session.test.ts`

### DOCE-SESSION-3.6 - Closing a room session

Closing a room-mode session shall end its connection, also when it closes while connecting.

Implementation: `src/session/room-session.ts`, `src/session/room-open.ts`
Verification: `src/session/room-session.test.ts`

### DOCE-SESSION-3.7 - Room providers

`roomConnection(provider)` (`./collab`) shall give a room provider, such as collaboration-tools', as the connection a collaboration adapter returns: its document, awareness, state, receipts, the local changes the room has not confirmed (`unconfirmedUpdates()`, one update each) and its reloads (`onReload`, DOCE-SESSION-3.11); `whenSynced` resolving at the first sync and rejecting on a refusal or a close; and `close()` destroying the provider.

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

### DOCE-SESSION-3.10 - Stepping away from the room

`suspend()` shall keep what the session has unsaved, as `flush` does, and then, in room mode, leave the shared room: the connection closes, so the binding stops, the reader's presence leaves the others' views and no pending write is left there; the document stays as it was and the connection store reads `connecting` with nothing editable. `resume()` shall, after a `suspend`, reload the document from its shared room and join it again, as opening does, and resolve false when that fails; a `resume` while the changes are still being kept keeps the room joined. In store mode `suspend` keeps what is unsaved and `resume` does nothing. A historical view uses them (DOCE-VERSIONS-5.1).

Implementation: `src/session/room-session.ts`, `src/session/store-session.ts`, `src/session/document-session.ts`
Verification: `src/session/room-session.test.ts`

### DOCE-SESSION-3.11 - Reloading after a refused change

When the room refuses a local change because it does not merge with what the room holds (DOCE-COLLAB-7.4), the connection reports a reload (`RoomConnection.onReload`, from collaboration-tools' `RoomProvider.onReload`) with the reason, the room's document and the writer's previous one, and keeps its socket. The session shall bind the editor to the room's document, show its content under the template its replacement document pins, with each selection endpoint following its text block by element id. When text in the block changes, the session shall map separate edits independently so an endpoint follows surviving text between them, including when the block’s overall length stays the same. For a span the bounded comparison cannot align, the endpoint keeps its relative offset in a replacement of the same width and otherwise follows the replacement boundary. An unchanged text block without an id shall keep its offset when it has a unique match of the same type and content in both documents. An endpoint without a matching block shall move to the nearest available position. A reload waiting for a different template shall pause editing until the content and template can be shown together. The session shall follow the replacement binding’s pin while loading the template. If that pin changes before a successful reload, the session shall retry with the latest pin and show the replacement content only once its current template resolves. A reload shall use the reader’s latest capabilities when it publishes the replacement state. A superseded reload shall leave the newer binding’s gate and notice untouched. The session shall keep the room's draft from the new document, and tell the writer: its `reloads` store holds the notice (`reason`, and the `previous` content) and the host's `onRoomReload` receives it, and the editor shows the `roomChangeRefused` label as a warning through its feedback. Keys typed between the refused change and the reload reach the new document as later changes of their own: what lies beside the refused change is kept and sent, and what lies inside its refused content is dropped with it. A key typed in the frame between the reload and the editor showing the room's document goes to the document the reader had and is dropped too; the notice holds that document as it was when the reload came, the writer's previous content, so nothing is lost silently. The connection stays open and the writer keeps writing on it.

Implementation: `src/session/room-session.ts`, `src/session/room-reload.ts`, `src/session/room-selection.ts`, `src/session/room-text-map.ts`, `src/session/room-open.ts`, `src/collab/room-connection.ts`, `src/components/document-editor/save-status-item.tsx`
Verification: `src/session/room-reload.test.ts`, `src/session/room-text-map.test.ts`, `src/components/document-editor/save-status-item.test.tsx`, `e2e/session-room.spec.ts`

## DOCE-SESSION-4 - Merging another writer's saves

In store mode two readers can edit the same stored document. When a save is refused as `conflict`, or the store tells of a save made elsewhere (DOCE-SESSION-7), the session merges the reader's unsaved changes into the stored document (D28) rather than asking the reader to choose a whole document.

### DOCE-SESSION-4.1 - Three-way merge by element id

`mergeDocuments({ base, mine, theirs })` shall merge two stored documents edited from the same base by element id: a block only one side changed, inserted or deleted takes that side's change; a container both sides changed, such as a section, a list or a table, merges its own settings and then its children the same way; blocks either side inserted are placed after the block before them on that side; and the order follows the side that moved blocks, the reader's when both did. Ordering shall use keyed anchors with work proportional to the number of sibling blocks. A block one side moved to another container, including a newly created section or nested list item, is merged once, where that side put it, the reader's place when both moved it, with what the other side changed in it; one the other side deleted stays where it was moved. If sorting the moves empties a container, the merge keeps required cell and column structure and removes empty quotes or lists. A conflict over a source container omits its separately moved children from both choices. The template pin and the document's language merge the same way, the reader's winning when both changed it, and its variables' texts (DOCE-FORMAT-1.7) merge key by key the same way, so a text one side refreshed and another the other side refreshed are both kept, and one a side took out stays out. Blocks without an element id are identified first, since each editor that opens a document stored without ids gives its blocks ids of its own: a block the base holds without one is paired with each side's block of the same content, or the one changed in its place, and the versions of one block take one id, the stored side's, else the reader's, else a new one (`newId`); the writer an editor named with the id is no change. When a save conflicts (`HostError.current`, or the stored document loaded again when the host gives none), the session shall show the merged document, take the stored document as its new baseline and save the merge against it, with no prompt when no block conflicts. The caret and the blocks that did not change stay as they were (DOCE-SESSION-7.2).

When selected moves would place blocks in a cycle, the merge shall keep the reader's placement for a stored move in that cycle. It shall repeat until the placements form a tree and merge the blocks' content at their resulting locations.

Implementation: `src/session/merge.ts`, `src/session/merge-children.ts`, `src/session/merge-identity.ts`, `src/session/merge-order.ts`, `src/session/merge-placements.ts`, `src/session/stored-elements.ts`, `src/session/stored-equality.ts`, `src/session/store-refresh.ts`, `src/session/store-saving.ts`
Verification: `src/session/merge.test.ts`, `src/session/merge-identity.test.ts`, `src/session/store-refresh.test.ts`, `e2e/session.spec.ts`

### DOCE-SESSION-4.2 - Conflicts

A block both sides changed differently, or a block or section one side deleted while the other changed it, shall be a conflict (`MergeConflict`: its merge key, the reader's version and the stored one, null for a deletion). The merged document shows the reader's version, or the changed one over a deletion. While conflicts remain, the session's `conflicts` store lists them, its status is `error` with a `conflict` error, and it does not save, so `flush()` resolves false. Identified section keys are distinct from anonymous position keys. An identified section id beginning with a hash is escaped with another hash. Another save taken in meanwhile keeps each conflict whose stored block or section it left as it was. An unresolved reader deletion remains a choice while the stored version survives, including after another edit to that version. An anonymous section is matched by its unique surviving content or element ids, so changing a section's position cannot misapply a choice. An ambiguous match leaves the choice pending. `resolveConflict(id, choice)` settles one. The choice `mine` keeps the reader's block or section as it is now. The choice `theirs` puts the stored version in its place. A deletion removes the block or section. The choice `both` applies to two blocks with text (`canKeepBoth`) and keeps the reader's block with the stored one after it under new element ids. A choice that cannot be applied leaves the document and conflict in place, including a missing target for a version to keep, deletion of the only section, and a change the editor refuses. `resolveMergeConflict` returns the input document unchanged when it cannot apply the choice. Once no conflict remains, the session saves again.

Implementation: `src/session/merge.ts`, `src/session/merge-conflicts.ts`, `src/session/store-refresh.ts`, `src/session/store-saving.ts`
Verification: `src/session/merge.test.ts`, `src/session/merge-identity.test.ts`, `src/session/store-refresh.test.ts`

### DOCE-SESSION-4.3 - The conflict prompt

`MergeConflicts` shall show one warning per conflicted block or section. The title indicates whether both sides changed it or one deleted it. The warning shows the word changes from the reader's text to the stored one (`InlineTextDiff`) and a group of buttons named by the title to keep mine, keep theirs and, for two blocks with text, keep both. It renders nothing while there is no conflict. Its text comes from `labels`.

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

In store mode, while the document has unsaved changes, the session shall keep its content in the stored format, with its template pin and the revision it was edited from, through the host's `drafts` adapter once changes pause for `draftDelay` milliseconds (300 by default), so a reload or a crash does not lose it. A change to the template pin alone also schedules a draft. Once a save leaves nothing unsaved, the session shall remove the draft. The session shall apply puts and clears in the order they were requested for a document and read after any outstanding writes from a previous session.

Implementation: `src/session/drafts.ts`, `src/session/draft-access.ts`, `src/session/store-session.ts`, `src/utils/trailing-timer.ts`
Verification: `src/session/drafts.test.ts`, `src/utils/trailing-timer.test.ts`, `e2e/session.spec.ts`

### DOCE-SESSION-6.2 - Offering a draft

When a document opens and the `drafts` adapter holds a draft for it, the session's `draft` store shall offer it (`savedAt`, `outdated`) until it is restored or discarded, and no later change replaces the offered draft meanwhile. `restoreDraft()` shall show the draft's content and template in place of the stored ones, as a change to save.

Implementation: `src/session/drafts.ts`, `src/session/store-session.ts`
Verification: `src/session/drafts.test.ts`, `e2e/offline.spec.ts`

### DOCE-SESSION-6.3 - Drafts the store already holds

A draft whose content and template pin the store already holds, compared as DOCE-SESSION-2.1 compares them, shall not be offered, and the session shall remove it.

Implementation: `src/session/drafts.ts`
Verification: `src/session/drafts.test.ts`

### DOCE-SESSION-6.4 - Drafts from an older revision

A draft edited from an older revision than the store holds shall be offered as `outdated`. Once restored, it shall be saved against the revision it was edited from, with that revision's content (`versions.load`) as its base, so the store refuses it as a `conflict` and the session merges it into the newer save (DOCE-SESSION-4) rather than losing either; blocks both changed wait for the reader. When the host cannot give that revision, having no `versions` adapter or failing to load it, the base shall be an empty document, so every block the draft and the newer save hold differently waits for the reader.

Implementation: `src/session/drafts.ts`
Verification: `src/session/drafts.test.ts`

### DOCE-SESSION-6.5 - Discarding a draft

`discardDraft()` shall end the offer and remove the draft, keeping the stored content.

Implementation: `src/session/store-session.ts`, `src/session/drafts.ts`
Verification: `src/session/drafts.test.ts`, `e2e/offline.spec.ts`

### DOCE-SESSION-6.6 - Drafts when the page goes away

When the host's `lifecycle` adapter says the page is hidden or being left, the session shall keep its draft at once, before it flushes, so a save that fails then still leaves the draft. Closing a session also keeps its latest unsaved changes immediately.

Implementation: `src/session/store-session.ts`, `src/session/drafts.ts`
Verification: `src/session/drafts.test.ts`, `e2e/offline.spec.ts`

### DOCE-SESSION-6.7 - Keeping room-mode drafts

In room mode, `keepRoomDrafts` shall keep the shared document's draft through the `drafts` adapter after each change, local or remote, once changes pause (1000 milliseconds by default), when the room has confirmed every local change, and at once when the page is hidden or left or when it is stopped with a draft still waiting: the document's state, the changes the room has not confirmed, one update each, the last state the room had confirmed all of (`confirmed`), and the room's generation. Draft writes for a document shall run in request order, including lifecycle saves and stop. The confirmed state shall be taken when a draft is kept with no change unconfirmed, and at once when the connection is lost with none unconfirmed, so edits made offline before the next draft merge from it; it is not taken at each confirmation, which would read the whole document for every change the room echoes.

Implementation: `src/collab/offline.ts`, `src/session/draft-access.ts`, `src/utils/trailing-timer.ts`
Verification: `src/collab/offline.test.ts`, `src/utils/trailing-timer.test.ts`

### DOCE-SESSION-6.8 - Replaying room-mode drafts

`restoreRoomDraft` shall apply a draft's state and unconfirmed changes to a new shared document as one merged update, which keeps causal order whatever order they were kept in (DOCE-COLLAB-4.6), and say whether Yjs integrated it whole. Handed to the connection as its unconfirmed updates, the draft's local changes reach the room one by one once it connects again (DOCE-COLLAB-7.4), and `whenStored` resolves once the room has stored them.

Implementation: `src/collab/offline.ts`
Verification: `src/collab/offline.test.ts`

### DOCE-SESSION-6.9 - Merging a room draft into a new generation

When a shared room has started a new generation since a draft was kept, `mergeRoomDraft` shall merge what the draft holds beyond the last state the room confirmed into the new generation's document, by element id (DOCE-SESSION-4): a block only the draft changed takes the draft's version, as one change the binding sends to the room. A block both changed, or one changed and the other removed, keeps the new generation's version and is reported as a leftover with the draft's version. A draft with no unconfirmed changes merges nothing, and a draft with no confirmed state reports every block that differs.

Implementation: `src/collab/offline.ts`
Verification: `src/collab/offline.test.ts`

### DOCE-SESSION-6.10 - Room-mode drafts in a session

A room-mode session shall open on the room's draft when the host keeps one, so the reader edits with no connection, and send the draft's unconfirmed changes once it connects. While connected, it shall keep the room's draft (DOCE-SESSION-6.7) and stop keeping it when closed, after committing held edits and keeping the draft still waiting then. When the room refuses the draft for belonging to an older generation, the session shall take the draft of the document as it is by then, with what the reader changed since it opened, keep it, open the room again without it and merge that draft into the new generation's document (DOCE-SESSION-6.9), sending the merge to the room, through the editor when one is bound; its leftovers are the session's `conflicts`, and the draft stays kept until they are settled. When the room cannot be opened again, the status shall be `failed` with the error and the draft stay kept. `resolveConflict` settles a leftover in the room's document: `mine` puts the draft's version in its place, `theirs` keeps the room's, and `both` keeps the room's with the draft's after it under new ids. The offline module, and with it the realtime library, loads only when the session needs it (DOCE-SESSION-3.1).

Implementation: `src/session/room-drafts.ts`, `src/session/room-session.ts`, `src/session/room-open.ts`
Verification: `src/session/room-drafts.test.ts`, `e2e/offline.spec.ts`

## DOCE-SESSION-7 - Refreshing from the store

### DOCE-SESSION-7.1 - Following the store's saves

When the host's document store tells of a save (`documents.subscribe`) newer than the one the session holds, the session shall wait for its own save in flight, load the stored document and take it in: shown as it is when the reader has no unsaved changes, merged with them otherwise (DOCE-SESSION-4), and taken as the new baseline. The merge shown is of the document as it is by then: what the reader types while the template that save pins loads is merged too. The session shall observe saves before loading its first snapshot and take in newer saves received during initialization before it is ready. Its own saves are not taken in again.

Implementation: `src/session/store-refresh.ts`, `src/session/open-document.ts`, `src/session/store-session.ts`
Verification: `src/session/document-session.test.ts`, `src/session/store-refresh.test.ts`, `e2e/session.spec.ts`

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

The shortcut table's `save` keys (Mod-s by default, remapped through the editing's `shortcuts`) pressed anywhere in the editor, its chrome included, shall save the `session` in place of the browser's own save; without a session they run the host's `onSave`, and without that they do nothing, the browser's save never opening over the document. Other keys, such as Mod-Shift-s, are left alone.

Implementation: `src/components/document-editor/save-status-item.tsx`, `src/components/document-editor/document-editor.tsx`, `src/engine/shortcuts.ts`
Verification: `src/components/document-editor/save-status-item.test.tsx`

### DOCE-SESSION-9.3 - Deciding suggestions

The editor shall offer accepting and rejecting suggestions, in the comments margin and the context menu, only while the reader edits without suggesting and their `capabilities` include `decide`. Without `capabilities` the editor assumes every capability.

Implementation: `src/components/document-editor/save-status-item.tsx`, `src/components/document-editor/editor-chrome.tsx`, `src/components/document-editor/editor-body.tsx`
Verification: `src/components/document-editor/save-status-item.test.tsx`

### DOCE-SESSION-9.4 - Load progress

`SessionLoading` shall show the base library's `LoadingOverlay` while the session opens its document, naming the phase it is in (`connecting`, `loading` or `syncing`, by `DEFAULT_SESSION_LOADING_LABELS` or the host's `labels`), after the host's `delay` when given, and nothing once the document is ready or failed. It is meant as a `DocumentSessionBoundary` fallback; given `progress`, it follows DOCE-SESSION-9.8 instead.

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

### DOCE-SESSION-9.8 - Measured load progress

`createLoadProgress(weights)` shall keep a load's progress over its phases in order, `connecting`, `loading`, `syncing` and `layout`, each with a fixed weight (`DEFAULT_LOAD_WEIGHTS`, which the host calibrates): a phase's weight is credited once, when it is completed or skipped, in any order, so the estimate (`percent`, a whole number) only grows, holds while a phase stalls and stays at most 99% until `ready()` makes it 100%. The snapshot gives the status (`loading`, `ready`, `failed` or `cancelled`), the first phase still to do, and the phases done of all; once a load is failed or cancelled, nothing changes it, so a load given up for another never moves the new one's progress. Nothing in it waits or moves on its own. Given that `progress`, `SessionLoading` shall complete each session phase as the session moves past it and skip those it never went through (such as connecting, in store mode), fail with a failed load, and show the overlay with the estimate as its bar (`value`, read out by the `estimatedProgress` label, by default `Estimated progress: N%`), the phase still to do as its hint (`layout` by default `Laying out the pages`) and the phases as its counter, until the load is ready, failed or cancelled; the editor given the same `loadProgress` makes it ready with its first settled layout (DOCE-EDITOR-4.27), so the overlay goes over the editor rather than in its place.

Implementation: `src/session/load-progress.ts`, `src/components/document-session/save-status.tsx`, `src/components/document-editor/first-layout.tsx`, `labs/src/session.lab.tsx`
Verification: `src/session/load-progress.test.ts`, `src/components/document-session/save-status.test.tsx`, `src/components/document-editor/editor-surface.test.tsx`, `e2e/session.spec.ts`

## Hooks

| Hook                           | Kind      | Values               | Description                                        |
| ------------------------------ | --------- | -------------------- | -------------------------------------------------- |
| `de-merge-conflicts`           | root      |                      | The conflict prompt (DOCE-SESSION-4.3).            |
| `de-merge-conflicts__conflict` | slot      |                      | One block's warning.                               |
| `data-kind`                    | attribute | `changed`, `deleted` | On a conflict: both changed it, or one deleted it. |
