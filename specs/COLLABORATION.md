# Collaboration

The editor shows the other people in a document and takes in their changes. The `./collab` entry keeps the editor's state in sync with a shared Yjs document (DOCE-COLLAB-4); the provider that keeps that document, such as a collaboration-tools room client, stays in the host. The host hands the editor each person's selection and marks the changes it applies from elsewhere as remote, so the editor's own features leave them alone.

## DOCE-COLLAB-1 - Presence

### DOCE-COLLAB-1.1 - Carets and selections

`createPresence()` shall draw each peer the host sets (`setPeers(state, peers)`, out of the history): a caret (`de-presence-caret`) at the head of their selection with their name (`de-presence-caret__label`), and the text their selection covers (`de-presence-selection`). Both carry the peer's id (`data-presence-peer`), a colour slot from it (`data-presence-slot`, one of `PRESENCE_COLOR_SLOTS`) and, when the peer has one, their colour as `--de-presence-color`. `listPeers(state)` lists them.

Implementation: `src/engine/presence.ts`, `labs/reference/editor-chrome.css`
Verification: `src/engine/presence.test.ts`, `e2e/collaboration.spec.ts`

### DOCE-COLLAB-1.2 - Following changes

The peers' selections shall move with the changes the editor makes, until the host sets them again.

Implementation: `src/engine/presence.ts`
Verification: `src/engine/presence.test.ts`

### DOCE-COLLAB-1.3 - Avatars

While the document has peers, the status bar shall show them as avatars (`de-document-editor__presence`, the base library's `AvatarGroup` named by the `presence` label), with their pictures when the host gives them, sorted by name, each in their caret's colour slot; choosing one scrolls to their caret (`scrollToPeer`).

Implementation: `src/components/document-editor/document-status-bar.tsx`
Verification: `e2e/collaboration.spec.ts`

### DOCE-COLLAB-1.4 - Colour slots and stacked carets

Each peer shall take the colour slot their id gives, or the next one no other peer has, peers taken in order of their ids so every view gives the same slots (`placePeers`), while there are no more peers than slots. Carets at the same position shall carry their place among them (`data-presence-stack`, from 1 for the second) so their labels do not cover each other, and a peer without a selection is listed without a caret.

Implementation: `src/engine/presence.ts`, `labs/reference/editor-chrome.css`
Verification: `src/engine/presence.test.ts`

## DOCE-COLLAB-2 - Remote changes

### DOCE-COLLAB-2.1 - Marking them

`markRemote(tr)` shall mark a change the host applies from elsewhere (`isRemoteTransaction`) and keep it out of the undo history. A transaction a plugin appends to a remote change is remote too; `includeAppended(isRemote)` extends a host's own test the same way, and the editing extension applies it to its `isRemote` option. A remote change is never turned into a suggestion, never refused by the edit lock, and never aborts a running proofing check.

Implementation: `src/engine/transaction-kind.ts`, `src/engine/proofing.ts`
Verification: `src/engine/transaction-kind.test.ts`

### DOCE-COLLAB-2.2 - Derived writes in the binding

A change a plugin appends to one the sync plugin applies from the shared document (DOCE-COLLAB-4) shall reach the shared document as the editor's own change, under the plugin's derived origin (`getCollabSync(state).derivedOrigin`), which the editor's undo manager does not track, so nobody's undo takes it back. The library's own plugins append none to a remote change (DOCE-EDITING-3.3), so an editor that receives one sends nothing back.

Implementation: `src/collab/sync-binding.ts`
Verification: `src/collab/sync.test.ts`

## DOCE-COLLAB-3 - Authorship

### DOCE-COLLAB-3.1 - Who wrote what

`documentAuthors(doc)` shall give the document's writers, the most text first, with the characters each wrote and a colour slot no other writer has (DOCE-COLLAB-1.4): a run of text is its contributor's, else its suggested insertion's writer's, else the writer of its block. `createAuthorship()` marks each writer's text with their slot (`data-author`, `data-author-slot`) while shown (`showAuthorship`, `isAuthorshipShown`).

Implementation: `src/engine/authorship.ts`
Verification: `src/engine/authorship.test.ts`

### DOCE-COLLAB-3.2 - Showing authorship

The document editor's `authorship` shall show who wrote what, the editor running the authorship plugin itself, and publish `data-authorship` on its root.

Implementation: `src/components/document-editor/use-change-notifications.ts`, `src/components/document-editor/use-document-layout.ts`, `labs/reference/editor-chrome.css`
Verification: `e2e/full-editor.spec.ts`

### DOCE-COLLAB-3.3 - Contributor marks

The text each of the writer's own changes inserts, typed or pasted, shall read as the writer's (`markContributors`, which the element ids plugin runs with its `author`; decision D1). A run that reads as another known writer's, by a contributor mark it took from the text before it (the mark is inclusive) or by its block's writer, loses that mark and takes the writer's, unless its block is the writer's, whose unmarked text already reads as theirs; so a person typing right after an agent's text is the writer of what they type, and typing in one's own blocks adds no marks. With no writer known, the inserted text shall only lose a mark it took from another writer. A reference's text, which is its target's, and text in page headers, footers and footnote areas are left as they are, and so are changes that lay pages out. Remote, derived and system changes, changes out of the history, and the automation API's changes, which mark their own text (DOCE-AUTOMATION), shall be left as they are.

Implementation: `src/engine/provenance.ts`, `src/engine/element-ids.ts`
Verification: `src/engine/provenance.test.ts`

## DOCE-COLLAB-4 - Sync

The `./collab` entry binds the editor state to a shared Yjs document (`@y/y` 14, an optional peer dependency) with the library's own binding (decisions D6, D30); it needs no forked binding and no room server package.

### DOCE-COLLAB-4.1 - Keeping in sync

`createCollabSync({ doc })` shall give a plugin that keeps the editor's document and the shared document's `content` type the same, both ways. Each local change goes to the shared document as one delta, from the nodes it changed, when the editor's plugin views update; each change of the shared document comes back as steps on the nodes it changed, so the selection and positions held elsewhere map through it. The plugin runs as a plugin view, so it binds the canonical state of the paged layout, whose plugin views run on a view of that state (DOCE-PAGINATION-7.15), as it binds any editor view. Marks that may overlap themselves come back in canonical order (DOCE-SCHEMA-5.1).

Implementation: `src/collab/sync.ts`, `src/collab/sync-binding.ts`, `src/collab/delta.ts`, `src/collab/diff.ts`, `src/collab/replay.ts`
Verification: `src/collab/sync.test.ts`

### DOCE-COLLAB-4.2 - Joining a shared document

When the plugin binds, a shared document that holds content shall replace the editor's document. An empty one shall take the editor's document, with every element given an id first (`assignElementIds`, which the editor takes as a system change), so the first edit does not send ids for the whole document; a host seeds rooms from documents with ids for the same reason.

Implementation: `src/collab/sync-binding.ts`
Verification: `src/collab/sync.test.ts`

### DOCE-COLLAB-4.3 - Where a change came from

A transaction that brings changes from the shared document shall stay out of the history and carry what it brings (`readCollabChange(tr)`: its kind and the Yjs origins of its changes). Changes of an origin the host's `isRemoteOrigin` takes as another person's, every origin by default, are `remote` and marked so (`markRemote`); changes of the host's other origins, such as a restored draft, are `system` changes (`markSystemChange`); changes of the editor's own undo manager (a `Y.UndoManager` that tracks `getCollabSync(state).origin`) are `undo`, neither remote nor system. A batch that holds a remote change is remote.

Implementation: `src/collab/sync.ts`, `src/collab/sync-binding.ts`
Verification: `src/collab/sync.test.ts`

### DOCE-COLLAB-4.4 - One render per burst

Changes from the shared document shall reach the editor together, in one transaction, when the plugin's `schedule` runs (at the end of the current task by default), so a burst of updates is drawn once; `getCollabSync(state).flush()` brings them at once, and an undo comes at once. Local changes made before they arrive, whether sent or not yet sent because the view updates late, shall be moved after them, keeping the selection on the text it was on; a local step that no longer applies after them is dropped.

Implementation: `src/collab/sync-binding.ts`, `src/collab/rebase.ts`
Verification: `src/collab/sync.test.ts`

### DOCE-COLLAB-4.5 - Convergence

Two to five editors that edit at random, with their updates reaching a shared room and the room's reaching them late and interleaved, shall end with the room's document: typing and deletions in body text, table cells and footnotes, deletions across blocks, splits and joins, page breaks, footnotes, block types, marks that overlap, each person's undo and redo, and editors whose changes from the room or whose view updates come late.

Implementation: `src/collab/sync-binding.ts`
Verification: `src/collab/sync-convergence.test.ts`

### DOCE-COLLAB-4.6 - Updates out of causal order

The binding relies on the shared document integrating each update it receives. Yjs 14 (rc.23 and rc.29) can leave complete updates pending when they arrive out of causal order; the fixture pins it, and fails once Yjs integrates them. Through a room server it does not happen, since each person's updates reach the room in the order they were made, the room's reach each person in the room's order, and collaboration-tools refuses incomplete updates; replaying offline updates must keep that order (the cached state, then the unconfirmed update).

Implementation: `src/collab/sync-binding.ts`
Verification: `src/collab/yjs-pending.test.ts`

## DOCE-COLLAB-6 - Shared rooms

### DOCE-COLLAB-6.1 - Room layout and write rules

A shared room shall hold the canonical whole-document state in the top-level type `content`, the comment and suggestion threads in `comments`, one attribute per thread keyed by its id, and the stored format version and template pin as attributes of `meta` (`docs/collaboration.md`). The documented write rules shall let a connection write `content` when its reader may edit, suggest or decide on suggestions, `meta` when they may edit, `comments` when they may edit, suggest, decide or comment, and no type outside the layout, deciding each update by the types it changes alone, so a commenter writes only `comments`.

Implementation: `docs/collaboration.md`
Verification: `test/shared-room-rules.test.ts`

### DOCE-COLLAB-6.2 - Seeds and server reads

`documentToYjs(file, { schema })` shall give the Yjs update that builds a room holding a stored document, its content in `content` and its format version and template pin in `meta`, each element without its own valid id given one as the editor gives it on opening (`newId`, random by default); `writeRoomDocument` shall write the same into a Yjs document that holds no document yet and refuse one that does. `yjsToDocument(update, { schema })` and `readRoomDocument` shall give back the stored document a room holds, or `null` for a room without one, and refuse a room of another format version. Both shall run without a DOM, and every document of the regression set shall come back as the editor opens it.

Implementation: `src/collab/convert.ts`
Verification: `src/collab/convert.test.ts`

### DOCE-COLLAB-6.3 - Each writer's own undo

`createCollabUndo()`, run beside the sync plugin with the editing history off, shall undo and redo only the changes the editor sent as its own: never another writer's, a write a plugin derived from one, or a host's system change. An undo shall reach the editor at once as an undo, not as a remote change. The editor's undo and redo (`undoCommand`, `redoCommand`), which its keys, toolbar and menubar run, shall run the commands a plugin of the state provides (`provideUndoCommands`), and the editing history's otherwise.

Implementation: `src/collab/undo.ts`, `src/engine/undo-commands.ts`, `src/engine/shortcut-commands.ts`, `src/components/document-editor/toolbar-controls.tsx`
Verification: `src/collab/undo.test.ts`, `src/engine/undo-commands.test.ts`

## Hooks

| Hook                       | Kind      | Values  | Description                                      |
| -------------------------- | --------- | ------- | ------------------------------------------------ |
| `de-presence-caret`        | root      |         | A peer's caret, at the head of their selection.  |
| `de-presence-caret__label` | slot      |         | The peer's name above their caret.               |
| `de-presence-selection`    | root      |         | The text a peer's selection covers.              |
| `data-presence-peer`       | attribute |         | On a caret or selection: the peer's id.          |
| `data-presence-slot`       | attribute | `0`–`7` | On a caret or selection: the peer's colour slot. |
| `--de-presence-color`      | property  |         | On a caret or selection: the peer's own colour.  |
