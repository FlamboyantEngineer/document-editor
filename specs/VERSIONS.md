# Versions

A document's saved versions are kept by the host's versions store (DOCE-HOST-1.6). The editor compares the document with an older version block by block: blocks are matched by their element id, so a block keeps its identity through edits and moves, and the parts of a block laid out across pages are one block. Comments and suggestions are left out of the comparison. The changes show on the document as change bars in the template's colors (DOCE-TEMPLATES-5.8) and, in markup, with the words and blocks that changed marked in place.

## DOCE-VERSIONS-1 - Comparing versions

### DOCE-VERSIONS-1.1 - Inserted, deleted and modified blocks

`compareVersions(older, newer)` shall give the changes from the older version to the newer one in the newer one's order: each block only the newer holds as an `insertion`, each block only the older holds as a `deletion`, and each block both hold whose text changed as a `modification`, with its element id, its parts in the newer version, its text and its older text. Two equal versions shall give no change.

Implementation: `src/engine/version-compare.ts`, `src/engine/common-subsequence.ts`
Verification: `src/engine/version-compare.test.ts`

### DOCE-VERSIONS-1.2 - Moves and formatting

A block both versions hold that left the longest run of blocks kept in order shall be a `move`. One whose kind or whose attributes saying what it holds changed (a heading's level, a paragraph's outline level, an image's or an object's source, a caption, an inline object such as a mention or a footnote) shall be a `modification`, as an edit of its text is. One whose text and content are unchanged but whose presentation changed (its text's marks, its style class, alignment, colors, size or object layout) shall be `formatting`. A move's bar takes the modification's color.

Implementation: `src/engine/version-compare.ts`, `src/engine/common-subsequence.ts`
Verification: `src/engine/version-compare.test.ts`, `src/engine/common-subsequence.test.ts`

### DOCE-VERSIONS-1.3 - Where deletions go

A deleted block shall be placed before the next block of the older version the newer one still holds, or after the newer version's last block when none follows.

Implementation: `src/engine/version-compare.ts`
Verification: `src/engine/version-compare.test.ts`

### DOCE-VERSIONS-1.4 - Review marks left out

A block's text shall be compared with every suggestion rejected, and comment anchors, suggestion marks and contributor marks shall not count as formatting.

Implementation: `src/engine/version-compare.ts`
Verification: `src/engine/version-compare.test.ts`

### DOCE-VERSIONS-1.5 - Word by word

A changed block's text shall be compared word by word (`diffText`), spaces and punctuation as words of their own, giving the runs it kept, inserted and deleted in order. A word changed only by characters added to or removed from it shall keep the characters it shares. A comparison shall take bounded time and memory: between their first and their last difference, two texts with more than a million pairs of words shall be compared by the words each holds once, kept in order, and between those word by word while a million pairs last; the words then left unmatched shall read as deleted and inserted.

Implementation: `src/engine/text-diff.ts`, `src/engine/common-subsequence.ts`
Verification: `src/engine/version-compare.test.ts`, `src/engine/common-subsequence.test.ts`

### DOCE-VERSIONS-1.6 - Suggestions accepted

Asked to (`compareVersions(older, newer, { suggestions: 'accepted' })`, or a comparison's `suggestions` in the editor), the versions shall be compared with every suggestion accepted: the text a suggestion deletes left out, the text and blocks it inserts compared. Inline markup shall not show text the document still shows as suggested for deletion a second time as deleted text: its line keeps the deletion's bar, and the struck suggestion stands for it.

Implementation: `src/engine/version-compare.ts`, `src/engine/version-changes.ts`, `src/engine/version-decorations.ts`, `src/components/document-editor/use-document-layout.ts`
Verification: `src/engine/version-compare.test.ts`

### DOCE-VERSIONS-1.7 - Containers

A block both versions hold whose containers changed (wrapped in or taken out of a list, a table or a quote, moved between them, or in a container whose kind or attributes changed, such as a list's kind or a cell's span) shall be marked `structureChanged`. It shall then be a `modification`, with its text changed or not. A change of a container's presentation alone (a cell's alignment, colors, height or column widths, a table's borders) shall count as formatting, and with a text change sets the modification's `formatChanged`.

Implementation: `src/engine/version-blocks.ts`, `src/engine/version-compare.ts`
Verification: `src/engine/version-compare.test.ts`

### DOCE-VERSIONS-1.8 - Blocks without ids or with new ones

A block whose key (its element id) the older version does not hold shall be paired with a block of the older version whose key the newer one does not hold that has the same kind and text, whatever their ids, in order, so blocks whose ids were made again compare unchanged. Otherwise, a block without an element id that the older version does not hold alike shall be paired with the block without an id of the older version whose words it is likest, when at least half of their words are shared, and compared with it as one block. A block of the same kind shall win a tie, and each older block shall pair once.

Implementation: `src/engine/version-pairing.ts`, `src/engine/version-compare.ts`
Verification: `src/engine/version-compare.test.ts`

### DOCE-VERSIONS-1.9 - Links and references

A block whose links point elsewhere, or whose references cite something else, shall be a `modification` whose `targets` names `link`, `reference` or both, even when its text and formatting are unchanged. A link's or a reference's target shall not count as formatting, and a reference's status (broken, its baseline and its label) shall not count as a target.

Implementation: `src/engine/version-blocks.ts`, `src/engine/version-compare.ts`
Verification: `src/engine/version-compare.test.ts`

### DOCE-VERSIONS-1.10 - Generated values

Values the document generates shall not count as a change: a reference's text, a variable's value, a script's output, a footnote's number, a template block's rendered markup and a contents block's entry range. Asked to (`compareVersions(older, newer, { generated: true })`, or a comparison's `generated` in the editor), a block whose only change is in such values shall be a `modification` marked `generated`.

Implementation: `src/engine/version-blocks.ts`, `src/engine/version-compare.ts`
Verification: `src/engine/version-compare.test.ts`, `src/engine/version-changes.test.ts`

## DOCE-VERSIONS-2 - Showing changes

### DOCE-VERSIONS-2.1 - Decorations

`versionChangeDecorations(doc, changes, display)` shall mark each changed block's parts with `data-diff-change` and the block before which, or after which, blocks were deleted with `data-diff-deletion`. A block whose text changed shall also be marked `data-diff-lines`, `formatting` when its formatting changed too, else `kept`, and what changed in it marked by kind (`data-diff-line`, from `changeLineMarks`): a run inserted (`insertion`), a run replacing deleted text (`modification`), and where text was deleted without a replacement (`deletion`). In `markup` it shall also mark inserted words (`data-diff-change="insertion"`), show deleted words as `del` elements where they were, and show each deleted block's text as a `del` element with `data-diff-block` inside the block it is placed at; in `bars` it shall do neither.

Implementation: `src/engine/version-decorations.ts`
Verification: `src/engine/version-compare.test.ts`

### DOCE-VERSIONS-2.2 - Following the document

`createVersionChanges({ previous, display })` shall show the changes from the older version `previous` gives to the document, as the document is after each change (DOCE-VERSIONS-2.5); without an older version it shall show none. A transaction marked with `refreshVersionChanges` shall read the older version and the display again, and `versionChanges(state)` shall give the changes shown.

Implementation: `src/engine/version-changes.ts`
Verification: `src/engine/version-compare.test.ts`

### DOCE-VERSIONS-2.3 - In the document editor

The document editor shall run the version changes in its view and its measuring view, compare the document with `compare.previous` (an older version, or `opened` for the document as the editor opened it) in `compare.display`, within `compare.scope` when given, marking its root with `data-comparing`, and lay the pages out again when either changes.

Implementation: `src/components/document-editor/use-document-layout.ts`, `src/components/document-editor/document-editor.tsx`
Verification: `e2e/versions.spec.ts`

### DOCE-VERSIONS-2.4 - Changed lines

`createChangeLines()` shall draw, inside each block it is given lines for (`setChangeLines`), a bar for each line (`de-change-lines__line`) with its kind (`data-diff-line`) and its top and height from the block's top (`--de-change-line-top`, `--de-change-line-height`), and keep the lines where their blocks go until they are set again. Changes on one line merge into the strongest (`strongerChange`): a modification, then an insertion, a deletion, a formatting change and a pending suggestion. The document editor shall install it, and, while the document shows changes or the simple markup shows suggestions (DOCE-EDITOR-6.5), measure the lines of each block whose text changed, and in the simple markup of each text block holding a suggestion's text, after each render and whenever the editor's box changes size, as when a frame that was hidden shows or its width reflows the lines; a line holding suggested text, or where hidden suggested-deleted text sits, takes the kind `suggestion`, and the template's change bar settings never hide it; a line takes the strongest change marked on it, a deleted block's text the deletion, blocks deleted before or after a block whose text does not show its first or last line, and every line of a block whose formatting changed too at least the formatting; each line reaches halfway to the next, so the bars of successive lines meet. A kind of change the template's change bars turn off where the block is (its section's setting, or else the template's) shall not count, so it never hides a shown kind on the same line. With the lines, the editor shall measure how far each barred block, one with a bar of its own or with line bars, sits inside its page's content box (`--de-change-bar-inset-left`, `--de-change-bar-inset-right`, unscaled), so the reference sheet draws every bar in one column at the template's offset from the page's content, whatever the block's indent or nesting (a list item, a table cell, a quotation). In the web layout (`data-layout="web"`) the reference sheet shall draw no bar for a change from an older version, a block's or a line's, and keep a pending suggestion's line bars.

Implementation: `src/engine/change-lines.ts`, `src/components/document-editor/change-lines-measure.ts`
Verification: `src/engine/change-lines.test.ts`, `src/components/document-editor/change-lines-measure.test.ts`, `e2e/versions.spec.ts`, `e2e/template-workspace.spec.ts`

### DOCE-VERSIONS-2.5 - Comparing only when needed

`previous` may give `opened`: the document as it was when the version changes started. A document equal to the older version shall show no change without being compared. A transaction that only follows the layout shall keep the changes shown, mapped, without comparing again: one out of the history (`addToHistory: false`), a derived one, or, in a scoped comparison, one that only types or deletes text outside the scope. A step of such a transaction that only sets a block's attributes or type, as attributing a block to its writer does, shall keep the block's change and its marks. A remote change and a system change shall always be compared again. The older version shall be read once, and again only when `previous` gives another or its suggestions count otherwise. A local change that only types or deletes text in at most eight text blocks shall compare those blocks alone, each with the older version's block of its element id, and keep the other changes, mapped, so it shows what comparing the versions would without reading either again. Where a block typed in cannot be compared alone (it has no element id, is a part of a split block or a block a suggestion inserts, or is inside a block read as one or a region drawn around the content), the versions shall be compared, as for any other change.

Implementation: `src/engine/version-changes.ts`, `src/engine/version-compare.ts`, `src/engine/version-scope.ts`
Verification: `src/engine/version-changes.test.ts`, `src/engine/hot-path.test.ts`

### DOCE-VERSIONS-2.6 - Scope and counts

Given a scope (`scope`, element ids), the version changes shall show only the changes inside it: a heading covers its headed section (`headingSectionSpan`, DOCE-OUTLINE-1.3) and another block itself. Each text block and leaf block outside the scope shall be marked `data-diff-scope="outside"`. `versionChangeCounts(state)` shall count the changes shown by kind and in all.

Implementation: `src/engine/version-changes.ts`, `src/engine/version-scope.ts`
Verification: `src/engine/version-changes.test.ts`, `e2e/versions.spec.ts`

## DOCE-VERSIONS-3 - Versions in the browser

### DOCE-VERSIONS-3.1 - Comparing with a saved version

Picking a version in the history shall mark the document's changes since that version: changed words, inserted, moved and modified blocks and deleted blocks' text.

Implementation: `labs/src/versions.lab.tsx`, `labs/reference/document.css`
Verification: `e2e/versions.spec.ts`

### DOCE-VERSIONS-3.2 - Change bars

Showing changes as bars shall draw a bar beside each changed block in its kind's template color, on the template's side, at its offset and width, with no changed text marked.

Implementation: `labs/reference/document.css`, `src/model/templates/template-properties.ts`
Verification: `e2e/versions.spec.ts`

### DOCE-VERSIONS-3.3 - Editing while comparing

Edits made while comparing shall update the changes shown.

Implementation: `src/engine/version-changes.ts`, `labs/src/versions.lab.tsx`
Verification: `e2e/versions.spec.ts`

### DOCE-VERSIONS-3.4 - Bars beside changed lines

Showing changes shall draw, for a block whose text changed, a bar beside each line that changed instead of one beside the block, in the color of the strongest change on the line, the bars of successive lines meeting.

Implementation: `labs/reference/document.css`, `src/engine/change-lines.ts`
Verification: `e2e/versions.spec.ts`

### DOCE-VERSIONS-3.5 - Comparing any two versions

Selecting two versions in the history and comparing them shall show the newer, read-only, with its changes since the older; clearing the selection shall show the document again.

Implementation: `labs/src/versions.lab.tsx`
Verification: `e2e/versions.spec.ts`

### DOCE-VERSIONS-3.6 - Scoped comparisons

Scoping a comparison to a heading shall show only the changes in its headed section, with their counts by kind, and dim the blocks outside it.

Implementation: `labs/src/versions.lab.tsx`, `labs/reference/document.css`
Verification: `e2e/versions.spec.ts`

## DOCE-VERSIONS-4 - History

### DOCE-VERSIONS-4.1 - Following the versions

`createDocumentVersions({ host, session })`, or `useDocumentVersions` for as long as a component shows it, shall list the open document's versions through the host's `versions` adapter, newest first, and list them again whenever the host tells of a change (`versions.subscribe`), until it is closed. A list that fails, or a host without versions, shall be reported as failed with the host's reason.

Implementation: `src/session/versions.ts`, `src/components/document-panels/document-history.tsx`
Verification: `src/session/versions.test.ts`, `src/components/document-panels/document-history.test.tsx`

### DOCE-VERSIONS-4.2 - Grouped history

`groupVersions(versions)` shall group versions listed newest first: each named version shall fold the automatic versions older than it, up to the next older named version, newest first. Automatic versions newer than every named one, and every version of a history without a named one, shall stand on their own.

Implementation: `src/session/version-groups.ts`
Verification: `src/session/versions.test.ts`

### DOCE-VERSIONS-4.3 - Saving a named version

`saveVersion(label)` shall first keep the session's changes (`flush`), then save the document's content, with the template it pins, as a version named `label` (`versions.create`). A `beforeVersion` hook shall see the version first and may change it, or save none by returning null. Before invoking the hook, it shall detach a `baseContent` copy of the body and template pin. In store mode it shall load the raw persisted baseline and verify, with the session schema, that its canonical content and template pin still match the captured session content. Comparing canonical reads of the serialized content shall account for schema defaults and layout-only page differences while retaining meaningful attributes and element ids. A changed baseline shall return `conflict` before invoking the hook; the raw verified baseline shall be retained unchanged through the hook. Room mode shall retain its captured room baseline without reading the separate document store. Every session create request shall carry that unchanged pre-hook baseline; the hook may transform the requested body but cannot change its baseline. The host shall compare the baseline to its authoritative current body and template atomically before naming or recording anything, returning `conflict` without changes if another save changed them. A version shall be refused with the host's reason when the changes cannot be kept or the host cannot save versions.

Implementation: `src/session/versions.ts`, `src/session/prepare-version.ts`, `src/components/document-panels/document-history.tsx`
Verification: `src/session/versions.test.ts`, `src/components/document-panels/document-history.test.tsx`, `e2e/history.spec.ts`

### DOCE-VERSIONS-4.4 - Renaming

`rename(revision, label)` shall name a version, or take its name away with null, and list the versions again.

The pane shall edit the name in a modal. Saving trims it; an empty name removes it. A name holds at most 255 characters (`REVISION_NAME_MAX_LENGTH`), in the rename dialog and when saving a version. A pending save holds the draft, and a failure keeps that draft with its error for retry.

Implementation: `src/components/document-panels/revision-actions.ts`, `src/components/document-panels/revision-dialog.tsx`, `src/session/versions.ts`
Verification: `src/components/document-panels/revision-list.test.tsx`, `src/session/versions.test.ts`

### DOCE-VERSIONS-4.5 - Restoring

`restore(revision)` shall make a version's content and the template it pins the document's. In store mode, with a host that restores versions (`versions.restore`) and tells of saves (`documents.subscribe`), it shall first keep the reader's changes, then have the host save the version as a new state, which the session takes in like another writer's save (DOCE-SESSION-7). In a shared room with `versions.restore`, it shall first flush pending room changes, then invoke the authoritative host service, which authorizes and publishes restored content and template through the room. It shall not write a client replacement when that route exists, including when the service refuses or is unavailable; the host error shall be returned. Failed flush shall invoke neither the service nor a fallback edit. Without that route, or in store mode without save subscriptions, it shall edit the document to the version as one change the reader may undo that is neither a suggestion nor refused by locked content (`markSystemChange`), and save it.

The pane shall confirm a restore in a modal before invoking it. A returned promise keeps the action pending; a failure remains visible and can be retried. The current revision offers no restore action.

An open revision action shall resolve its target from the latest collection. Removing the target or its callback closes the dialog; making the target current also closes restoration. A closed stale action shall not reopen if its target returns, and submission shall recheck current target and callback availability before invoking the host.

Implementation: `src/components/document-panels/revision-actions.ts`, `src/components/document-panels/revision-dialog.tsx`, `src/session/versions.ts`, `src/session/version-restore.ts`
Verification: `src/components/document-panels/revision-list.test.tsx`, `src/session/versions.test.ts`, `src/session/version-restore.test.ts`, `e2e/history.spec.ts`

### DOCE-VERSIONS-4.6 - The history pane

`DocumentHistory` shall show the versions through the editor-owned `RevisionList`, built from `ListView`, `Attribution`, filters and modal revision actions, grouped (DOCE-VERSIONS-4.2), the current one marked, each with who saved it, the host's `detail` (such as a draft number) first in its summary, and the template and comment threads it keeps when the host lists them. Picking a version shall mark its row, and its row action "View version" shall view it (DOCE-VERSIONS-5.1); with `viewOnPick` picking a version shall view it at once. Picking the current one or none shall return, and comparing two shall view the newer compared with the older (DOCE-VERSIONS-5.2); a version that could not be shown, refused or not read at all, says why above the list. It shall offer to save and name versions only to a reader who may save versions, to restore one only to a reader who may edit, and the history only to a reader who may open it.

Named-only and author filters shall retain their choices while groups expand or fold. When the filters hide every version, the list shall say that no version matches rather than that there are none; when the versions could not be listed, it shall show only the error and its retry. An unnamed version shall be titled by when it was saved, in the base library provider's locale and time zone (a calendar day as that day), so a server render and its hydration agree, and an unreadable time by the provider's `unknownTime` text. All revision action, grouping and filter text belongs to the document or template labels. The list shall emit the `de-revision-list` hooks (Hooks).

Implementation: `src/components/document-panels/revision-list.tsx`, `src/components/document-panels/revision-row.tsx`, `src/components/document-panels/revision-toolbar.tsx`, `src/components/document-panels/revision-hooks.ts`, `src/components/document-panels/revision-item.ts`, `src/components/document-panels/revision-labels.ts`, `src/components/document-panels/document-history.tsx`, `src/components/document-panels/history-labels.ts`, `labs/src/history.lab.tsx`
Verification: `src/components/document-panels/revision-list.test.tsx`, `src/components/document-panels/document-history.test.tsx`, `e2e/history.spec.ts`

### DOCE-VERSIONS-4.7 - What the reader may do

The versions shall follow the session's live capabilities: saving and naming a version shall be refused (`denied`) without `saveVersion`, restoring one without `edit`, and listing and viewing versions without `history`. The history pane shall read the session's capabilities unless it is given its own.

Implementation: `src/session/versions.ts`, `src/components/document-panels/document-history.tsx`
Verification: `src/session/versions.test.ts`, `src/components/document-panels/document-history.test.tsx`

## DOCE-VERSIONS-5 - Historical view

### DOCE-VERSIONS-5.1 - Viewing a version

`viewVersion(revision, { returnTo })` shall show a version in place of the document: its content in an editor state of its own (only the version asked for last is shown, and none still being read when the reader returns), read with the template it pins at the revision it pins (D14). `historicalEditorProps` shall give the document editor that state, read-only, with that template, and `updateView` shall keep the view's state, such as its selection. Before it reads the version, `viewVersion` shall step the session away from the live document (`suspend`, DOCE-SESSION-3.10): in room mode it leaves the shared room, so the view can write nothing there and the reader's presence leaves it; `returnFromView`, a view that fails before it shows, and `restore` shall `resume` it, which reloads the document from the room and joins it again. In store mode the document's own state and saving go on unchanged.

Implementation: `src/session/versions.ts`, `src/components/document-panels/document-history.tsx`
Verification: `src/session/versions.test.ts`, `src/session/room-session.test.ts`, `src/components/document-panels/document-history.test.tsx`, `e2e/history.spec.ts`

### DOCE-VERSIONS-5.2 - Comparing two versions

With `compareWith`, the view shall also hold the older version, and the editor shall show the viewed version's changes from it (DOCE-VERSIONS-2.3). The revision list shall keep at most two versions selected, the newest picks, and select-all shall leave the selection unchanged.

Implementation: `src/session/versions.ts`, `src/components/document-panels/document-history.tsx`
Verification: `src/components/document-panels/revision-list.test.tsx`, `src/session/versions.test.ts`, `src/components/document-panels/document-history.test.tsx`

### DOCE-VERSIONS-5.3 - Returning

`returnFromView()` shall end the view and give back what the reader had when the first view of a run of views opened (`returnTo`), such as their mode, markup and comments, for the host to put back.

Implementation: `src/session/versions.ts`, `src/components/document-panels/document-history.tsx`
Verification: `src/session/versions.test.ts`, `src/components/document-panels/document-history.test.tsx`, `e2e/history.spec.ts`

### DOCE-VERSIONS-5.4 - The banner

`DocumentHistoryBanner` shall show, while a view is open, which version shows (or which two are compared), an unnamed one by its saved time as the history titles it (`versionTitle(version, savedTime)`), the template it pins, and an action that returns.

Implementation: `src/components/document-panels/document-history.tsx`
Verification: `src/components/document-panels/document-history.test.tsx`, `e2e/history.spec.ts`

### DOCE-VERSIONS-5.5 - Captured discussion

A host may implement `versions.loadSnapshot` to read the required `{ content, threads, template }` bundle captured atomically at the requested revision. `template` shall be the fully resolved template result, including all inherited parent and base settings, detached at revision recording rather than on the first historical read. A snapshot-backed view shall use this result directly and never load the leaf, parent or base templates from live sources. A failed snapshot read shall fail the historical view, without falling back to current discussion. `OpenedVersion.threads` shall contain the captured threads, or null for a content-only host; its `comments` adapter shall provide independent copies of that discussion and deny every supported mutation. `historicalEditorProps` shall replace live comments with this adapter and `canComment: false`, so existing comment providers and panels can read historical discussion without subscribing to live threads. `updateView` shall retain selection changes but refuse document edits.

A snapshot-capable host shall perform `versions.create` in one transaction that commits the supplied content and template pin, captures discussion and resolves the entire template inheritance result from that same transaction, with the returned revision identifying the entire bundle. Supplied `baseContent` shall be compared against the authoritative current body and template in that same transaction before any history, label or discussion side effect. A direct host `create` call that omits the optional baseline is explicitly unconditional and provides no protection against concurrent body changes. If the host cannot commit those together against its current authoritative state it shall return `conflict` and publish no version; it shall never attach current threads to an earlier content revision. A room host shall use one consistent room read or room transaction for the content, template and discussion. Changed discussion or resolved template settings shall produce a distinct revision even when content is unchanged. The in-memory host shall synchronously capture the resolved template for every initial state, automatic save, named version and restore. A template capture failure shall be recorded and fail historical bundle reads without a later live retry; named creation with a failed capture shall return the error before any side effect. It shall not assemble historical snapshots from separate current-content and current-comment requests. The in-memory host shall capture threads on every saved revision. Content-only legacy adapters shall retain the documented fallback that loads the stored pin when history opens; an unversioned pin or inherited template may therefore resolve current settings, so those adapters do not guarantee immutable historical presentation. Restoring a version shall restore content and its original stored template pin only, preserving current discussion; historical threads shall never be written back. This does not reinstate the captured resolved presentation: an unversioned restored pin and inherited parents keep ordinary live resolution semantics. A host needing that operation must explicitly materialize the captured settings through its own restore service.

Implementation: `src/host/adapters.ts`, `src/host/historical-comments.ts`, `src/host/memory-comments.ts`, `src/host/memory-documents.ts`, `src/host/memory-host.ts`, `src/host/memory-templates.ts`, `src/session/open-version.ts`, `src/session/prepare-version.ts`, `src/session/versions.ts`, `src/components/document-panels/document-history.tsx`
Verification: `src/session/version-snapshot.test.ts`, `src/session/version-template-snapshot.test.ts`

## Hooks

| Hook                          | Kind      | Values                                                              | Description                                                                          |
| ----------------------------- | --------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `data-comparing`              | state     | `markup`, `bars`                                                    | On the editor while it shows changes from an older version.                          |
| `data-diff-change`            | attribute | `insertion`, `deletion`, `modification`, `formatting`, `move`       | On a changed block, an inserted word or a deleted text.                              |
| `data-diff-deletion`          | attribute | `before`, `after`                                                   | On the block before which, or after which, blocks were deleted.                      |
| `data-diff-block`             | attribute | `true`                                                              | On a deleted block's text.                                                           |
| `data-diff-scope`             | attribute | `outside`                                                           | On a block outside a scoped comparison.                                              |
| `data-diff-lines`             | attribute | `kept`, `formatting`                                                | On a block whose text changed: what its other lines show.                            |
| `data-diff-line`              | attribute | `insertion`, `deletion`, `modification`, `formatting`, `suggestion` | On a changed word, where text was deleted, or a line's bar.                          |
| `de-change-lines`             | root      |                                                                     | The bars beside a block's changed lines.                                             |
| `de-change-lines__line`       | slot      |                                                                     | One changed line's bar.                                                              |
| `--de-change-line-top`        | property  |                                                                     | The line's top from the block's top, in pixels.                                      |
| `--de-change-line-height`     | property  |                                                                     | The line's height, in pixels.                                                        |
| `--de-change-bar-inset-left`  | property  |                                                                     | On a barred block: how far its left edge sits inside its page's content, in pixels.  |
| `--de-change-bar-inset-right` | property  |                                                                     | On a barred block: how far its right edge sits inside its page's content, in pixels. |
| `de-revision-list`            | root      |                                                                     | The revision list, with `data-loading` while versions load.                          |
| `de-revision-list__toolbar`   | slot      |                                                                     | The filters and the compare action.                                                  |
| `de-revision-list__error`     | slot      |                                                                     | Why the versions could not be listed, with its retry.                                |
| `de-revision-list__list`      | slot      |                                                                     | The selectable versions.                                                             |
| `de-revision-list__empty`     | slot      |                                                                     | No versions, or none matching the filters.                                           |
| `de-revision-list__row`       | slot      |                                                                     | A version; see its state attributes below.                                           |
| `data-current`                | state     | `true`                                                              | On the row of the current version.                                                   |
| `data-named`                  | state     | `true`                                                              | On the row of a named version.                                                       |
| `data-nested`                 | state     | `true`                                                              | On an automatic version shown under its named version.                               |
| `data-expanded`               | state     | `true`                                                              | On a row whose folded versions show.                                                 |
| `de-revision-list__fold`      | slot      |                                                                     | The toggle that shows or folds a row's earlier versions.                             |
| `de-revision-list__title`     | slot      |                                                                     | A version's name or saved time.                                                      |
| `de-revision-list__current`   | slot      |                                                                     | The current version's badge.                                                         |
| `de-revision-list__meta`      | slot      |                                                                     | Who saved a version and when, and its summary.                                       |
| `de-revision-list__summary`   | slot      |                                                                     | What a version keeps beside its content.                                             |
| `de-revision-list__actions`   | slot      |                                                                     | A version's view, rename and restore menu.                                           |
| `de-revision-list__dialog`    | slot      |                                                                     | A rename or restore dialog, with `data-action`.                                      |
