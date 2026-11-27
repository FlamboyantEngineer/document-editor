# Collaboration

The editor shows the other people in a document and takes in their changes. The `./collab` entry keeps the editor's state in sync with a shared Yjs document (DOCE-COLLAB-4); the provider that keeps that document, such as a collaboration-tools room client, stays in the host. The host hands the editor each person's selection and marks the changes it applies from elsewhere as remote, so the editor's own features leave them alone.

## DOCE-COLLAB-1 - Presence

### DOCE-COLLAB-1.1 - Carets and selections

`createPresence()` shall draw each peer the host sets (`setPeers(state, peers)`, out of the history): a caret (`de-presence-caret`) at the head of their selection with their name (`de-presence-caret__label`), and the text their selection covers (`de-presence-selection`, which also carries their name in `data-presence-name`, so the host's sheet can name them on hover of any part of it). Both carry the peer's id (`data-presence-peer`), a colour slot from it (`data-presence-slot`, one of the editor's colour slots, DOCE-COLLAB-1.8) and, when the peer has one, their colour as `--de-presence-color`. A colour is written only when it is a plain CSS colour (`isCssColor`: a hex colour, a colour's name, or a colour function of numbers), since it may be whatever another participant published; any other is left out, and the peer shows in their slot's colour. `listPeers(state)` lists them.

Implementation: `src/engine/presence.ts`, `src/model/schema/css-color.ts`, `labs/reference/editor-chrome.css`
Verification: `src/engine/presence.test.ts`, `src/model/schema/css-color.test.ts`, `e2e/collaboration.spec.ts`

### DOCE-COLLAB-1.2 - Following changes

The peers' selections shall move with the changes the editor makes, until the host sets them again.

Implementation: `src/engine/presence.ts`
Verification: `src/engine/presence.test.ts`

### DOCE-COLLAB-1.3 - Avatars

While the document has peers, the toolbar shall show them as avatars (`DocumentPresence`, item `presence`, first in the `mode` group, so just before the editing mode menu; `de-document-editor__presence`, the base library's `AvatarGroup` named by the `presence` label), with their pictures when the host gives them, sorted by name, each in their caret's colour slot, at most `PRESENCE_VISIBLE` (5) before the rest join a count. Each avatar carries the peer's status (`active`, `idle` or `away`, which the host's sheet fades) and names what they are doing (`presenceActivity` labels: Editing, Reviewing, Viewing, Idle, Away). Hovering or focusing an avatar opens their card (`de-document-editor__presence-card`, the base library's `UserIdentity`): their name, picture or initials, email (`data-presence-email`) and what they are doing (`data-presence-activity`); `renderCard(peer)` replaces it. Choosing one scrolls to their caret (`scrollToPeer`): smoothly, by the least distance that leaves the caret `PRESENCE_REVEAL_MARGIN` (24 CSS pixels) from the edges of the view on either axis, and not at all when it already is that far inside; a peer without a caret does not scroll, and the reader's selection stays where it is.

Implementation: `src/components/document-editor/presence-avatars.tsx`, `src/components/document-editor/mode-controls.tsx`, `src/engine/presence.ts`
Verification: `src/components/document-editor/presence-avatars.test.tsx`, `src/engine/presence.test.ts`, `e2e/collaboration.spec.ts`, `e2e/comments-host-options.spec.ts`

### DOCE-COLLAB-1.4 - Colour slots and stacked carets

Each peer shall take the colour slot their id gives, or the next one no peer before them has, peers taken in the order the avatars show them (by name, then id, `byName`), so the people shown have colours no other shown person has while there are no more of them than slots (`placePeers(peers, slots)`, `PRESENCE_COLOR_SLOTS` by default). The reader is never a peer, so they take no colour. The slots are the base library's (`getColorIndex` over the ids). Carets at the same position shall carry their place among them (`data-presence-stack`, from 1 for the second) so their labels do not cover each other and the reference sheet offsets each caret sideways by its place, and a peer without a selection is listed without a caret.

Implementation: `src/engine/presence.ts`, `labs/reference/editor-chrome.css`
Verification: `src/engine/presence.test.ts`

### DOCE-COLLAB-1.5 - Presence through a shared room

`createAwarenessPresence({ awareness, user })` from `./collab` shall share presence through the shared document's awareness, such as a collaboration-tools room provider's, beside the sync plugin and `createPresence`. It shall publish the reader (`user`: id, name, picture, colour and email), their selection as Yjs relative positions in the `content` type (`cursor`, published again only when it changes, and once more after the views are made when it named no place yet, as when the reader is the first in an empty room; a position inside an inline node with content, such as a template variable, counts the text before that node by its characters, as the shared type does), their status (`status`) and what they did last (`activity`, DOCE-COLLAB-1.6), and set the other people from the awareness on the presence plugin, once for a burst of awareness changes and again after each change from the shared document, so each caret stays on the same characters in every editor whatever its width or layout. A person who leaves is listed no more; the reader's cursor is cleared when the plugin's view goes. The reader joins without a caret: `cursor` stays null until their first pointer press, key press or text input in the content that the browser reports as theirs (trusted); opening the document, focus given by code, scrolling, the toolbar and the others' changes do not place them. Once placed, their caret is shared through blur, a layout switch (a new view of the same plugin) and a reconnection; a new session places them anew. Like the sync plugin, it stays out of the paged layout's hidden measuring view (its spec says `measured: false`), so one view shares the reader's cursor and status. Any participant writes their awareness, so of another person's it takes a colour only when it is a plain CSS colour (DOCE-COLLAB-1.1) a picture only when its address is `http`, `https` or an inline image (`data:image/`), and an email only when it is one line with one `@`.

Implementation: `src/collab/awareness.ts`, `src/collab/relative-positions.ts`
Verification: `src/collab/awareness.test.ts`, `e2e/presence.spec.ts`, `src/collab/relative-positions.test.ts`

### DOCE-COLLAB-1.6 - Status and activity

Each person shall be `active`, `idle` after `idleAfter` without input of their own (two minutes by default), or `away` while their page is hidden (the host's lifecycle), and active again on their next input, a wheel or touch scroll over the editor, or when the page shows again. Each person's latest activity (`activity`, `PresenceActivity`) shall be `editing` after a change to the content, `reviewing` after a suggestion, a decision on one or a change to a comment's anchor, and `viewing` after a selection or a scroll, `viewing` until then; a change from elsewhere is no activity. Peers carry it (`Peer.activity`) for their avatars and cards (DOCE-COLLAB-1.3). An idle or away peer's caret and selection shall carry `data-presence-status`, and a caret shall be drawn again when its peer's status, name or colour changes, also while it stays where it is.

Implementation: `src/collab/awareness.ts`, `src/engine/presence.ts`, `labs/reference/editor-chrome.css`
Verification: `src/collab/awareness.test.ts`, `src/engine/presence.test.ts`, `e2e/session-room.spec.ts`

### DOCE-COLLAB-1.7 - Presence by element address

A host that shares selections without a shared Yjs document (store mode) shall give each peer's selection by address (`at`: an element id and an offset in the element's text, each inline object counting one); setting the peers turns it into positions in the editor's own document, and a peer whose element the document lacks has no caret. `presenceSelection(state)` gives the reader's selection in the same form to share.

Implementation: `src/engine/presence-address.ts`, `src/engine/presence.ts`
Verification: `src/engine/presence-address.test.ts`, `e2e/presence.spec.ts`

### DOCE-COLLAB-1.8 - The host's count of colour slots

The host shall set how many colour slots people are told apart by with one count for the editor (`DocumentEditor`'s `colorSlots`, or `setColorSlots(count)` on a state of its own, out of the history), a whole number of at least one, `PRESENCE_COLOR_SLOTS` (8) when not given or not one. The carets and selections (DOCE-COLLAB-1.4), the avatars and their cards (DOCE-COLLAB-1.3, the base library's `colorCount`), the authorship tints (DOCE-COLLAB-3.2) and the contributors pane (DOCE-COLLAB-3.4) shall all place people in that count (`colorSlotsOf(state)`), and a new count places them again at once, the presence plugin and the authorship plugin each from the same transaction. With as many slots as people, no two people share a slot. The host's sheet gives each slot its colour; the reference sheet colours eight, and the contributor colours lab (DOCE-LABS-3.11) as many as it sets.

Implementation: `src/engine/color-slots.ts`, `src/engine/presence.ts`, `src/engine/authorship.ts`, `src/components/document-editor/use-change-notifications.ts`, `src/components/document-editor/presence-avatars.tsx`, `src/components/document-panels/document-contributors.tsx`, `labs/src/contributor-colors.lab.tsx`
Verification: `src/engine/color-slots.test.ts`, `src/components/document-panels/document-contributors.test.tsx`, `e2e/contributor-colors.spec.ts`

## DOCE-COLLAB-2 - Remote changes

### DOCE-COLLAB-2.1 - Marking them

`markRemote(tr)` shall mark a change the host applies from elsewhere (`isRemoteTransaction`) and keep it out of the undo history. A transaction a plugin appends to a remote change is remote too; `includeAppended(isRemote)` extends a host's own test the same way, and the editing extension applies it to its `isRemote` option. A remote change is never turned into a suggestion, never refused by the edit lock, and never aborts a running proofing check.

Implementation: `src/engine/transaction-kind.ts`, `src/engine/proofing.ts`
Verification: `src/engine/transaction-kind.test.ts`

### DOCE-COLLAB-2.2 - Derived writes in the binding

A change a plugin appends to one the sync plugin applies from the shared document (DOCE-COLLAB-4) shall reach the shared document as the editor's own change, under the plugin's derived origin (`getCollabSync(state).derivedOrigin`), which the editor's undo manager does not track, so nobody's undo takes it back. The library's own plugins append none to a remote change (DOCE-EDITING-3.3), so an editor that receives one sends nothing back.

Implementation: `src/collab/sync-binding.ts`
Verification: `src/collab/sync.test.ts`

### DOCE-COLLAB-2.3 - Held during a gesture

While the reader is in the middle of a gesture on the content of the view the sync plugin binds, an input method composition (from `compositionstart` until the view has ended it), a pointer press (from a `pointerdown` in the content to the next `pointerup` or `pointercancel` anywhere) or a drag (from `dragstart` to `dragend` or `drop`), the changes from the shared document shall wait instead of reaching the editor, so text never moves under the composition or the pointer; they shall reach it at once, in one transaction, when the last gesture ends (`holdDuringGestures`). A gesture whose end never comes holds for 10 seconds at most. Undo from the editor's own undo manager and an explicit `flush()` are not held. A view without a page, as on a server, holds nothing.

Implementation: `src/collab/gesture-hold.ts`, `src/collab/sync.ts`, `src/collab/sync-binding.ts`
Verification: `src/collab/gesture-hold.test.ts`

## DOCE-COLLAB-3 - Authorship

### DOCE-COLLAB-3.1 - Who wrote what

`documentAuthors(doc)` shall give the document's writers, the most text first, with the characters each wrote and a colour slot no other writer has (DOCE-COLLAB-1.4): a run of text is its contributor's, else its suggested insertion's writer's, else the writer of its block. `createAuthorship()` marks each writer's text with their slot (`data-author`, `data-author-slot`) while shown (`showAuthorship`, `isAuthorshipShown`), and text an agent generated, whose contributor mark names a session, also with `data-author-source="generated"`, so a stylesheet sets it apart (the reference sheet stripes it). Showing and hiding it changes only these marks: the pages are not drawn again.

Implementation: `src/engine/authorship.ts`, `labs/reference/editor-chrome.css`
Verification: `src/engine/authorship.test.ts`, `e2e/full-editor.spec.ts`

### DOCE-COLLAB-3.2 - Showing authorship

The document editor's `authorship` shall show who wrote what, the editor running the authorship plugin itself, and publish `data-authorship` on its root.

Implementation: `src/components/document-editor/use-change-notifications.ts`, `src/components/document-editor/use-document-layout.ts`, `labs/reference/editor-chrome.css`
Verification: `e2e/full-editor.spec.ts`

### DOCE-COLLAB-3.3 - Contributor marks

The text each of the writer's own changes inserts, typed or pasted, shall read as the writer's (`markContributors`, which the element ids plugin runs with its `author`; decision D1). A run that reads as another known writer's, by a contributor mark it took from the text before it (the mark is inclusive) or by its block's writer, loses that mark and takes the writer's, unless its block is the writer's, whose unmarked text already reads as theirs; so a person typing right after an agent's text is the writer of what they type, and typing in one's own blocks adds no marks. With no writer known, the inserted text shall only lose a mark it took from another writer. A reference's text, which is its target's, and text in page headers, footers and footnote areas are left as they are, and so are changes that lay pages out. Remote, derived and system changes, changes out of the history, an undo or a redo, whose text comes back with the marks it had, and the automation API's changes, which mark their own text (DOCE-AUTOMATION), shall be left as they are.

Implementation: `src/engine/provenance.ts`, `src/engine/element-ids.ts`
Verification: `src/engine/provenance.test.ts`

### DOCE-COLLAB-3.4 - The contributors pane

`DocumentContributors`, the side panel's `contributors` pane, shall list the document's writers (`documentAuthors`) in one stable row each, ordered by the name they show with and then by id (not by how much they wrote, and with no count), each named by the host's identity adapter (the panel's `identity`, else the editor's comment identity) or by their id, with their colour slot (`data-author`, `data-author-slot`), and publish whether authorship shows (`data-authorship`). A writer the identity adapter names (`data-kind="person"`) shall open a card on hover and keyboard focus over the whole row: the editor's (their name and picture) or `renderCard`'s. Changes the system made (the writer `system`, `data-kind="system"`) shall show as the `systemContributor` label in text only, with no colour, picture or card; a writer the adapter does not name (`data-kind="unresolved"`) has no card; and text with no writer at all (`hasUnattributedText`) shall add a last plain row, `unknownContributor` (`data-kind="unknown"`). With `onAuthorshipChange`, a switch shows or hides authorship by asking the host to change the editor's `authorship`.

Implementation: `src/components/document-panels/document-contributors.tsx`, `src/components/document-panels/built-in-panes.tsx`, `src/components/document-panels/panel-labels.ts`, `labs/src/host-panes.tsx`
Verification: `src/components/document-panels/document-side-panel.test.tsx`, `e2e/document-panels.spec.ts`, `e2e/comments-host-options.spec.ts`

## DOCE-COLLAB-4 - Sync

The `./collab` entry binds the editor state to a shared Yjs document (`@y/y` 14, an optional peer dependency) with the library's own binding (decisions D6, D30); it needs no forked binding and no room server package.

### DOCE-COLLAB-4.1 - Keeping in sync

`createCollabSync({ doc })` shall give a plugin that keeps the editor's document and the shared document's `content` type the same, both ways. Each local change goes to the shared document as one delta, from the nodes it changed, when the editor's plugin views update; each change of the shared document comes back as steps on the nodes it changed, so the selection and positions held elsewhere map through it. The plugin runs as a plugin view, so it binds the canonical state of the paged layout, whose plugin views run on a view of that state (DOCE-PAGINATION-7.15), as it binds any editor view. It binds one view at a time, and stays out of the paged layout's hidden measuring view (its spec says `measured: false`), so no change is replayed twice. Marks that may overlap themselves come back in canonical order (DOCE-SCHEMA-5.1). A change beside a character outside the basic plane, such as an emoji, shall reach the shared document as whole characters: no change starts or ends between the two halves of one, so peers editing beside it converge on the same whole characters. A change to an inline embed's marks, such as a suggestion mark a footnote marker takes, shall reach the other writers with the embed and its marks: where Yjs reports such a change to them as a deletion of the embed or without its format, the binding, the room's guard and the reader of room changes take the changed inline content from the shared document itself.

Implementation: `src/collab/sync.ts`, `src/components/document-editor/start-paging.ts`, `src/collab/sync-binding.ts`, `src/collab/delta.ts`, `src/collab/diff.ts`, `src/collab/replay.ts`, `src/collab/guard-snapshots.ts`, `src/collab/room-changes.ts`, `src/utils/fragment-diff.ts`
Verification: `src/collab/sync.test.ts`, `src/collab/guard-self-check.test.ts`, `src/collab/room-change-guard.test.ts`, `e2e/shared-room.spec.ts`, `src/utils/fragment-diff.test.ts`

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

The binding relies on the shared document integrating each update it receives. Yjs 14 (rc.23 and rc.29) can leave complete updates pending when they arrive out of causal order; the fixture pins it, and fails once Yjs integrates them. Through a room server it does not happen, since each person's updates reach the room in the order they were made, the room's reach each person in the room's order, and collaboration-tools refuses incomplete updates; replaying offline updates must keep that order (the cached state, then the unconfirmed updates).

Implementation: `src/collab/sync-binding.ts`
Verification: `src/collab/yjs-pending.test.ts`

### DOCE-COLLAB-4.7 - A shared document the schema cannot read

When the shared document holds what the editor's schema cannot read, such as a block of a type a newer schema added, as the plugin binds or in a change it takes, the plugin shall stop: it takes no further change from the shared document and sends none to it, since the editor no longer shows what the shared document holds and its changes would land in the wrong places, and no view binds again. It shall tell the host once (`onUnreadable(error)`), and throw the error when the host gave no such callback.

Implementation: `src/collab/sync.ts`, `src/collab/sync-binding.ts`
Verification: `src/collab/sync.test.ts`, `src/session/room-session.test.ts`, `e2e/session-room.spec.ts`

## DOCE-COLLAB-5 - Connection

### DOCE-COLLAB-5.1 - Connection phases

`connectionPhase(state)` shall read a room connection's state (`RoomState`, as the host's collaboration adapter gives it) as one phase: `generation-mismatch` while the room refuses the document for holding another generation; `refused` while the room refuses the connection for another reason; `offline` while disconnected; `connecting` while connecting or reconnecting, before access is granted or before the connection's first sync; then `read-only` or `synced` by the access granted.

Implementation: `src/collab/connection.ts`
Verification: `src/collab/connection.test.ts`

### DOCE-COLLAB-5.2 - Opening and locking

`connectionGate(phase, { cached, hasSynced })` shall say whether the reader may change the document and whether every surface is locked (decision D15). A document opened from a cached state of the room, or synced once since it opened, shall be editable at once and while connecting, reconnecting or offline; one without either shall stay read-only until its first sync, so a fresh editor never writes content the room's seed would repeat; such an editor binds the sync plugin only once synced, since binding an empty shared document writes the editor's document into it (DOCE-COLLAB-4.2). A read-only connection takes no content changes; a refused connection or another generation locks every surface until the connection recovers. `gateCapabilities(capabilities, gate)` narrows the reader's capabilities by it: without content changes, no editing, suggesting, deciding or saving versions; locked, no comments either; the history stays open.

Implementation: `src/collab/connection.ts`
Verification: `src/collab/connection.test.ts`, `e2e/presence.spec.ts`

### DOCE-COLLAB-5.3 - Connection status item

`ConnectionStatus` shall show a phase in words (`CONNECTION_STATUS_LABELS`, each replaceable) as a polite status (`de-connection-status`), with the phase in `data-phase`, `data-locked` in a phase that locks every surface, and `data-editable` while the reader may change the document. A host places it among the status bar's items.

Implementation: `src/components/document-editor/connection-status.tsx`, `labs/reference/editor-chrome.css`
Verification: `e2e/presence.spec.ts`

## DOCE-COLLAB-6 - Shared rooms

### DOCE-COLLAB-6.1 - Room layout and write rules

A shared room shall hold the canonical whole-document state in the top-level type `content`, the comment and suggestion threads in `comments`, one attribute per thread keyed by its id, and the stored format version and template pin as attributes of `meta` (`docs/collaboration.md`). The documented write rules shall let a connection write `content` when its reader may edit, suggest or decide on suggestions, `meta` when they may edit, `comments` when they may edit, suggest, decide or comment, and no type outside the layout, deciding each update by the types it changes alone, so a commenter writes only `comments`.

Implementation: `docs/collaboration.md`
Verification: `test/shared-room-rules.test.ts`

### DOCE-COLLAB-6.2 - Seeds and server reads

`documentToYjs(file, { schema })` shall give the Yjs update that builds a room holding a stored document, its content in `content` and its format version and template pin in `meta`, each element without its own valid id given one as the editor gives it on opening (`newId`, random by default); `writeRoomDocument` shall write the same into a Yjs document that holds no document yet and refuse one that does. `yjsToDocument(update, { schema })` and `readRoomDocument` shall give back the stored document a room holds, or `null` for a room without one, and refuse a room of another format version. It shall read the stored document under the policy given (`unknown`, DOCE-FORMAT-1.5): under the default one, a document holding a node the schema cannot read, such as a figure without its size (DOCE-SCHEMA-3.14), throws and changes nothing; kept, such a node is a placeholder in the room that reads back as it was stored, never one given a size. Both shall run without a DOM, and every document of the regression set shall come back as the editor opens it.

Implementation: `src/collab/convert.ts`
Verification: `src/collab/convert.test.ts`

### DOCE-COLLAB-6.3 - Each writer's own undo

`createCollabUndo()`, run beside the sync plugin with the editing history off, shall undo and redo only the changes the editor sent as its own: never another writer's, a write a plugin derived from one, or a host's system change. An undo shall reach the editor at once as an undo, not as a remote change. The editor's undo and redo (`undoCommand`, `redoCommand`), which its keys, toolbar and menubar run, shall run the commands a plugin of the state provides (`provideUndoCommands`), and the editing history's otherwise. Like the sync plugin, it shall keep one view at a time and stay out of the paged layout's measuring view. What there is to undo and redo shall outlive the state taking other plugins, as when the paged layout starts or stops, which starts every plugin view again. A room-mode session shall run it beside its sync plugin.

Implementation: `src/collab/undo.ts`, `src/engine/undo-commands.ts`, `src/engine/shortcut-commands.ts`, `src/components/document-editor/toolbar-controls.tsx`, `src/session/room-binding.ts`
Verification: `src/collab/undo.test.ts`, `src/engine/undo-commands.test.ts`, `src/session/room-session.test.ts`

### DOCE-COLLAB-6.4 - Shared room lab

The shared room lab shall show two writers editing one document in its room on an in-process room server, each at their own width and zoom, either able to go offline and come back, to switch between page and web view and to suggest, and shall show the harness the document each writer's editor holds (`window.collabRoom`). What either changes, together or apart, shall reach the other, both holding the same document, and each one's undo shall undo only their own changes.

Implementation: `labs/src/collab-room.lab.tsx`, `test/session-rooms.ts`
Verification: `e2e/shared-room.spec.ts`

### DOCE-COLLAB-6.5 - Server writes into an open room

`updateRoomDocument(doc, file, { schema, origin })` shall write a stored document into a Yjs document that already holds one as one Yjs transaction under `origin`, writing only what differs from the content it holds: the blocks it leaves unchanged stay the same shared types, so places in them hold, and a writer's concurrent change to another block is kept. It shall set the format version and template pin in `meta` only where they differ, write nothing for a document the room already holds, write the whole document into a room that holds none, as `writeRoomDocument` does, and refuse a room of another format version. An editor bound to the room shall take the write as one change. It shall keep the page headers and footers the room holds, which the writers' editors set from the template with attributes the stored format does not keep (such as `editable`), since the writers take the write as a remote change and set no region again; but only while they still apply: the same template pin, the same number of sections, and at each place a section of the same name with the same own header and footer settings. Given the template the pin names (`pageTemplate`), every other section's headers and footers shall be set from it, read-only, as a writer's editor shows them; without it, or given a template whose id is not the pin's, they are as the stored document reads them, editable placeholders, until a writer's own change sets them again. It shall run without a DOM.

Implementation: `src/collab/convert.ts`
Verification: `src/collab/convert.test.ts`

### DOCE-COLLAB-6.6 - Sorting room updates by permission

`watchRoomChanges(doc, { schema })` shall watch a room's Yjs document, and its `classify(transaction, { author })`, called from the room's `afterTransaction`, shall give what an update needs: the set of permissions `needs`, each granted on its own, and `outside`, whether it changes a top-level type other than `content`, `comments` and `meta`. `comment` is needed for a change to `comments`, or to `content` that only adds or removes comment highlights or changes their state; `suggest` for adding suggestions in `author`'s name (suggested insertions, deletions, formatting and block splits) and for withdrawing `author`'s own (deleting text they suggested inserting, taking off a deletion they suggested), including text moved from one of their suggestions to another; `decide` for accepting any suggestion (taking off an insertion mark or a format suggestion, removing text suggested for deletion, clearing a suggested block's attributes) and for withdrawing another writer's (rejecting it); `edit` for any other change to `content`, any change to `meta`, and suggestions added in another writer's name or with no `author`. A suggested footnote is its marker's insertion: its entry comes with a marker the update suggests and goes with a suggested marker it takes away, as the marker's writer's suggestion; footnotes carry no number (DOCE-FOOTNOTES-2.2, DOCE-SUGGESTIONS-1.5). An update needs every permission its parts need, so accepting a suggestion and formatting beside it in one update needs `decide` and `edit`; the formatting a format suggestion carries and the contributor mark an accepted insertion leaves belong to the decision. An update that changes nothing needs nothing. Each update shall be read against the content as it stood before it, which the watch keeps by replaying each change as the binding does, so it holds after a guard reverts an update; and it shall be read the way that needs the least, an edit costing most and a decision more than a suggestion, comparing the content before and after it, so an edit sorts alike however its Yjs change expresses it. Sorting is not the whole of authorization: it does not check whose comment record an update writes, nor that a suggestion's id and text are its writer's. It shall run without a DOM.

Implementation: `src/collab/room-changes.ts`, `src/collab/room-change-walk.ts`, `src/collab/room-change-footnotes.ts`
Verification: `src/collab/room-changes.test.ts`, `src/collab/room-change-guard-security.test.ts`, `e2e/session-room.spec.ts`

### DOCE-COLLAB-6.7 - A room server's write guard

`openRoomChangeGuard(shadow, { schema, permissions, authorOf })` shall open a write guard for a collaboration-tools room server (`RoomWriteRules.openGuard`, COLLAB-SERVER-7.2) on the server's shadow of a room, watching it as `watchRoomChanges` does from the moment the room loads. Its `check({ actor, capabilities, transaction })` shall refuse an update that changes a type outside the room's layout, pass one that needs nothing, and otherwise pass it only when `permissions(actor, capabilities)`, the host's trusted resolver, grants every permission it needs (`edit`, `suggest`, `decide`, `comment`); no permission implies another, so a host that wants edit to cover comment says so in its resolver. The writer's suggestion author shall be `authorOf(actor)`, or the actor's id. Each check shall cost about the update's own size, not the room's. `destroy()` shall stop watching.

Implementation: `src/collab/room-change-guard.ts`
Verification: `src/collab/room-change-guard.test.ts`, `e2e/session-room.spec.ts`

### DOCE-COLLAB-6.8 - Seeding and exporting threads

`writeRoomComments(doc, threads, { scope })` shall write stored comment threads into a room that holds none yet, in one transaction, so that `readRoomComments(doc, { scope })` and the room comment store list them as stored: who started each thread and when, its state, who resolved or deleted it and when, its target, change and decision, and its comments with their authors, dates, edits, deletions and reactions. It shall refuse a room that holds threads already and write nothing. A host seeds a room with `writeRoomDocument` and `writeRoomComments`, and stores what `readRoomDocument` and `readRoomComments` give back.

Implementation: `src/collab/comment-seed.ts`
Verification: `src/collab/comment-seed.test.ts`, `e2e/session-room.spec.ts`

### DOCE-COLLAB-6.9 - Stored texts by key

A room shall keep the variable texts a document stores (the top node's `values`, DOCE-FORMAT-1.7) as one attribute of `content` per key, named `values.` and the key (`values.document.name`), never as one attribute holding the whole record, and read them back as the record; a document storing none keeps none. So writers who set the texts of different keys at once both keep theirs, a change writes only the keys it changes, and each writer's undo (DOCE-COLLAB-6.3) and redo take back and put back only the keys their own change set, whatever another writer set beside them. When two writers set the same key at once and the writer whose text the room kept undoes, that key shall hold no text, since an undo never brings back a text another writer's change replaced, and every other key keep its text; the writers' editors store the key's text again from the host (DOCE-PAGINATION-8.8). A room's write guard shall take such an attribute only on `content` itself and only holding a text, and refuse the record held whole (`values` itself on `content`); a room without a guard that holds one shall read and replay it as nothing, so an open editor and a fresh read of the room agree.

Implementation: `src/collab/delta.ts`, `src/collab/replay.ts`, `src/collab/guard-shape.ts`, `docs/collaboration.md`
Verification: `src/collab/document-values-room.test.ts`, `src/collab/room-change-guard-security.test.ts`

## DOCE-COLLAB-7 - Embedded documents and server enforcement

### DOCE-COLLAB-7.1 - Independent fields in one room

`createRoomScope(doc, key)` selects independent content, metadata, discussion and awareness namespaces within one shared document and provider. Sync, conversion and discussion APIs accept the returned shared handles; room sessions accept `fieldKey`. Full-document defaults keep `content`, `meta`, `comments` and the existing awareness fields. Each field uses the same editing engine and controls in web layout, with optional chrome. Undo tracks only that field's type and origin. Relative positions outside a field never resolve inside it; disposing its presence leaves the other fields intact. Drafts retain the complete transport state and resolve only the selected field when merging into another generation. Hosts lease a shared connection and give independent session document ids to independently persisted field drafts.

Implementation: `src/collab/room-scope.ts`, `src/collab/sync.ts`, `src/collab/convert.ts`, `src/collab/comment-store.ts`, `src/collab/awareness.ts`, `src/collab/relative-positions.ts`, `src/collab/offline.ts`, `src/session/room-binding.ts`, `src/session/document-session.ts`
Verification: `src/collab/room-scope.test.ts`, `src/collab/awareness.test.ts`, `e2e/session-room.spec.ts`

### DOCE-COLLAB-7.2 - Authoritative pre-application guard

`openRoomChangeGuard` implements the optional room-server guard lifecycle. The host maps authenticated admission to document capabilities; the guard validates the persistent server-owned shadow before the server applies, broadcasts or persists the update. Suggest-only writes preserve the document obtained by rejecting only the authenticated actor's own proposals; a suggested footnote is its marker's insertion, its entry coming and going with that marker (DOCE-SUGGESTIONS-1.5), and footnotes carry no number for the guard to read, since each view numbers its own (DOCE-FOOTNOTES-2.2), so a change to a marker or an entry is an edit like any other attribute's; foreign proposals retain their position relative to unchanged content, and may not alter another author's suggestion, its text, formatting or the blocks it holds (each block's kind and element id) alike. Edit, suggest, comment and decide are independent permissions: direct edit does not grant proposal creation or decisions. Initial document creation and whole-content removal use the same semantic validation against a neutral schema-valid baseline. A room holds the document whole, so the guard refuses what only the pages draw: every attribute only the pages set other than at its whole value, even from an editor: each attribute a type's fragment rule gives back when its parts join (`FRAGMENT_RULES`, such as a part of a split block, `splitPartIndex`, the drawing widths of a continued table, `projectedColumnWidths`, a continued code block and its first line, `codeBlockContinued` and `codeLineStart`, and a contents block's entry range and title, `entryStart`, `entryEnd` and `showTitle`), a list item continued from an earlier page (`orphanedListContinuation`), a continued container's placeholder paragraph (`continuationPlaceholder`) and a table's or code block's caption showing a later part's text (`continuedText`), so a change of the part a block is is never a decision, and a block the pages split reaches the room whole; a caption's text changes as any text does (DOCE-OBJECTS-2.1). A whole figure suggested for insertion or deletion carries the suggestion on the figure and the same suggestion's marks on its caption's text, which name its writer: a figure marked for deletion without the writer's own marks is refused, so the engine suggests no deletion of a whole block none of whose text would take them, and a whole table carries them alike, the suggestion and its writer on its holder (`table_figure`) and the marks on its caption's and cells' text; a code block, which cannot be a suggested block (DOCE-SUGGESTIONS-1.5), is refused whole as a suggester's, while its caption's text is suggested as any text is. Deciding requires the separate decision capability, and accepting an insertion may change its text's contributor only as DOCE-SUGGESTIONS-2.7 does: name the suggester where none is named, or credit generated text to the writer who accepts it, keeping its session; withdrawing one's own pending changes and their undo remain valid. Discussion entries keep immutable authorship and creation dates, and only their owner edits or deletes them, a reply only while it is the last left in an open thread (DOCE-COMMENTS-2.30); a deleted entry or thread stays as a record of who deleted it and when, is never taken out and changes no more (DOCE-COMMENTS-2.32). Thread creation and reactions use the authenticated actor. Unknown records fail closed. Invalid or unreadable candidates and a disposed guard refuse updates. Root-level room rules still reserve server metadata and any types outside the document layout. The guard replays content deltas into a persistent parsed mirror exactly as the room holds them, never fitting content in with nodes of its own, so content the schema refuses where it is, such as a table or a code block outside its holder or a caption holding a block, fails closed. This holds for writers' honest concurrent changes too: two updates each allowed alone that together leave such a shape, as when two editors each delete a different item of a two-item list, admit the first and refuse the later one whole, a writer's offline changes sent on reconnect included, so the room never holds a shape its readers refuse; the guard answers such a change as one that does not merge, not as one the writer had no right to make (DOCE-COLLAB-7.4); hosts still account for structural and proposal validation work when sizing rooms. An explicit `scopes` list validates all configured fields together, and any unconfigured root is refused. Trusted `authorOf` maps suggestion authors independently of authenticated discussion ownership; null denies authoring. Explicit `manageComments` and `manageProposals` exceptions grant no other permission, and only `labelAgents` lets a writer name an assistant (`agent`) or keep the host's `meta` on a discussion record (DOCE-COMMENTS-2.27). The frame-path benchmark includes actual semantic shadow application and live follow, keeps setup outside timing, retains median budgets of 5/12/35 ms for 200/1000/3000 ordinary paragraphs and 20 ms for 1000 paragraphs with 500 proposals, and reports p95 without a hard tail cutoff. Proposal membership uses cached signature indexes and anchors use one snapshot-local position index, avoiding pairwise proposal and document scans.

Implementation: `src/collab/room-change-guard.ts`, `src/collab/guard-anchors.ts`, `src/collab/guard-attributes.ts`, `src/collab/guard-format.ts`, `src/collab/guard-positions.ts`, `src/collab/guard-proposals.ts`, `src/collab/guard-content.ts`, `src/collab/guard-comments.ts`, `src/collab/guard-records.ts`, `src/collab/guard-snapshots.ts`, `src/collab/guard-shape.ts`, `src/collab/guard-marks.ts`, `src/collab/guard-footnotes.ts`, `src/collab/room-change-footnotes.ts`, `src/collab/replay.ts`
Verification: `src/collab/room-change-guard-security.test.ts`, `src/collab/guard-content.test.ts`, `src/collab/guard-suggested-tables.test.ts`, `src/collab/guard-positions.test.ts`, `src/collab/room-change-guard-perf.test.ts`

### DOCE-COLLAB-7.3 - Guard self-check

The guard returned by `openRoomChangeGuard` shall offer `verify()` for the room server's self-check (collaboration-tools `RoomWriteRules.verifyEvery` and `verifyIdleMs`): it shall read every configured scope's content from the shadow from scratch and return `true` only when each equals the parsed reading the guard keeps by replaying changes, `false` when a reading differs, could not be replayed, or the guard is destroyed. A room server that gets `false` rebuilds the shadow, reopens the guard and reports the drift, so a defect in the kept reading cannot outlive the next verification. Comment records and metadata are read from the shadow at each check and need no verification. The comparison costs a reading of the room and runs only when the server calls it, never on the per-update path. While its kept reading no longer matches the room, as after a trusted write the guard's schema cannot read, the guard places no suggestion anchors, so it throws inside none of the room's later transactions.

Implementation: `src/collab/guard-snapshots.ts`, `src/collab/room-change-guard.ts`
Verification: `src/collab/guard-self-check.test.ts`, `e2e/session-room.spec.ts`

### DOCE-COLLAB-7.4 - Changes refused for their merge

A change the guard refuses only because, merged with what the room already holds, it leaves a shape the schema refuses shall be answered as a `conflict` (collaboration-tools `RoomGuardAnswer`, COLLAB-SERVER-7.7), not as a refusal for rights. The guard shall tell the two kinds apart by fitting the merged content in, as a reader's editor does, and judging the writer's rights on that reading: when the fitted change is one the writer may make, the answer is `conflict`; when it is not, or the content cannot be read even fitted, the answer is a refusal, so a writer who may only suggest, or who sends a change outside its rights, is cut off as before whatever the merge. The room server applies, broadcasts and persists nothing of a refused change, tells only its writer, naming the refused change and nothing of other writers' content, and keeps the connection; past the server's bound of such refusals from one connection (`conflictLimit`, ten a minute by default) it cuts the writer off as for rights, so an honest writer with more than ten colliding changes in a minute is cut off as before. Each such refusal rebuilds the server's shadow, a copy of the room, so a connection may cost up to ten copies a minute where a refused write cost one; hosts count them when sizing rooms. The guard's mirror is left as the room holds it, so it equals the room afterwards (DOCE-COLLAB-7.3) and the writer's next change that merges is admitted. A fitted reading has no positions in the shared content, so on it another writer's suggestion counts as kept in place when the reading still holds it with its writer and its text; this holds for a fitted reading only, and an exact reading on which the guard cannot place another writer's suggestion is refused. The writer's provider gives up the refused change and reloads the document from the room (DOCE-SESSION-3.11). Offline changes reach the room one by one on reconnect, each the local changes made within half a second of each other, so the guard admits those that merge and refuses only the one that collides; a later change that builds on content of a refused one loses what lies inside that content and keeps what lies beside it.

Implementation: `src/collab/room-change-guard.ts`, `src/collab/guard-snapshots.ts`
Verification: `src/collab/room-change-guard-security.test.ts`, `src/session/room-reload.test.ts`, `e2e/session-room.spec.ts`

### DOCE-COLLAB-7.5 - One element for each id

A suggestion's signature names the blocks it holds by their element ids, so every stored element the room holds shall keep a well-formed id of its own (DOCE-SCHEMA-2.3). The guard shall refuse a change after which the room holds more stored elements without a well-formed id than before, or an element id on more nodes than held it before, the drawn regions' included (a footnote entry or a header holds none, so a copy there is refused too, and a writer without edit rights may not change their attributes at all), from any writer: a writer may send either, such as a suggester's block with no id or another's, and honest changes can merge into the second, as two moves of one block or two changes of its type do. Another writer's editor would give an element without an id one at its next structural change, changing the first writer's suggestion, and be refused for it, so one writer's block could otherwise cut others off. The refusal is a `conflict` (DOCE-COLLAB-7.4) when the change is otherwise one the writer may make: nothing of it is applied, so the room keeps its ids whatever the answer, and a writer who is honest but whose merge collides loses one change rather than the connection, while the server's bound cuts off a writer who keeps sending them. What a stored room already holds, an element without an id or an id held twice, does not refuse later changes, and no change may add another copy of it. Each new reading of the room is read once for its ids.

Implementation: `src/collab/guard-element-ids.ts`, `src/collab/room-change-guard.ts`
Verification: `src/collab/room-change-guard-security.test.ts`, `e2e/session-room.spec.ts`

## Hooks

| Hook                                    | Kind      | Values                                                                           | Description                                                                                                     |
| --------------------------------------- | --------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `de-presence-caret`                     | root      |                                                                                  | A peer's caret, at the head of their selection.                                                                 |
| `de-presence-caret__label`              | slot      |                                                                                  | The peer's name above their caret.                                                                              |
| `de-presence-selection`                 | root      |                                                                                  | The text a peer's selection covers.                                                                             |
| `data-presence-peer`                    | attribute |                                                                                  | On a caret or selection: the peer's id.                                                                         |
| `data-presence-slot`                    | attribute | `0` to the colour slots less one (`0`–`7` by default)                            | On a caret or selection: the peer's colour slot.                                                                |
| `--de-presence-color`                   | property  |                                                                                  | On a caret or selection: the peer's own colour.                                                                 |
| `data-presence-status`                  | attribute | `idle`, `away`                                                                   | On a caret or selection: the peer is not active.                                                                |
| `data-presence-name`                    | attribute |                                                                                  | On a selection: the peer's name, for a hover name.                                                              |
| `data-presence-email`                   | attribute |                                                                                  | On a card: the peer's email.                                                                                    |
| `data-presence-activity`                | attribute | `editing`, `reviewing`, `viewing`                                                | On a card: what the peer did last.                                                                              |
| `de-connection-status`                  | root      |                                                                                  | The shared room connection's phase, in the status bar.                                                          |
| `data-phase`                            | attribute | `connecting`, `synced`, `offline`, `read-only`, `refused`, `generation-mismatch` | On the connection status: its phase.                                                                            |
| `data-locked`                           | state     |                                                                                  | On the connection status: the phase locks every surface.                                                        |
| `data-editable`                         | state     |                                                                                  | On the connection status: the reader may change the document.                                                   |
| `data-author`                           | attribute |                                                                                  | On a writer's text while authorship shows: the writer's id.                                                     |
| `data-author-slot`                      | attribute | `0` to the colour slots less one (`0`–`7` by default)                            | On a writer's text while authorship shows: their colour slot.                                                   |
| `data-author-source`                    | attribute | `generated`                                                                      | On text an agent generated while authorship shows.                                                              |
| `de-document-contributors`              | root      |                                                                                  | The contributors pane, with `data-authorship`.                                                                  |
| `de-document-contributors__list`        | slot      |                                                                                  | The list of writers.                                                                                            |
| `de-document-contributors__contributor` | slot      |                                                                                  | A writer, with `data-author`, `data-author-slot` and `data-kind` (`person`, `unresolved`, `system`, `unknown`). |
