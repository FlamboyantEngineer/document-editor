# Collaboration

The editor shows the other people in a document and takes in their changes; the sync itself, such as a shared document of a collaboration library, stays in the host. The host hands the editor each person's selection and marks the changes it applies from elsewhere as remote, so the editor's own features leave them alone.

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

The text each of the writer's own changes inserts, typed or pasted, shall carry the writer's contributor mark (`markContributors`, which the element ids plugin runs with its `author`; decision D1), replacing any other writer's that it took from the text before it, since the mark is inclusive: a person typing right after an agent's text is the writer of what they type. With no writer known, the inserted text shall carry no contributor mark. Remote, derived and system changes, changes out of the history, and the automation API's changes, which mark their own text (DOCE-AUTOMATION), shall be left as they are.

Implementation: `src/engine/provenance.ts`, `src/engine/element-ids.ts`
Verification: `src/engine/provenance.test.ts`

## Hooks

| Hook                       | Kind      | Values  | Description                                      |
| -------------------------- | --------- | ------- | ------------------------------------------------ |
| `de-presence-caret`        | root      |         | A peer's caret, at the head of their selection.  |
| `de-presence-caret__label` | slot      |         | The peer's name above their caret.               |
| `de-presence-selection`    | root      |         | The text a peer's selection covers.              |
| `data-presence-peer`       | attribute |         | On a caret or selection: the peer's id.          |
| `data-presence-slot`       | attribute | `0`–`7` | On a caret or selection: the peer's colour slot. |
| `--de-presence-color`      | property  |         | On a caret or selection: the peer's own colour.  |
