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

`markRemote(tr)` shall mark a change the host applies from elsewhere (`isRemoteTransaction`) and keep it out of the undo history. A remote change is never turned into a suggestion, never refused by the edit lock, and never aborts a running proofing check.

Implementation: `src/engine/presence.ts`, `src/engine/proofing.ts`
Verification: `src/engine/presence.test.ts`

## Hooks

| Hook                       | Kind      | Values  | Description                                      |
| -------------------------- | --------- | ------- | ------------------------------------------------ |
| `de-presence-caret`        | root      |         | A peer's caret, at the head of their selection.  |
| `de-presence-caret__label` | slot      |         | The peer's name above their caret.               |
| `de-presence-selection`    | root      |         | The text a peer's selection covers.              |
| `data-presence-peer`       | attribute |         | On a caret or selection: the peer's id.          |
| `data-presence-slot`       | attribute | `0`–`7` | On a caret or selection: the peer's colour slot. |
| `--de-presence-color`      | property  |         | On a caret or selection: the peer's own colour.  |
