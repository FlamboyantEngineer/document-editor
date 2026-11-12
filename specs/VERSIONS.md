# Versions

A document's saved versions are kept by the host's versions store (DOCE-HOST-1.6). The editor compares the document with an older version block by block: blocks are matched by their element id, so a block keeps its identity through edits and moves, and the parts of a block laid out across pages are one block. Comments and suggestions are left out of the comparison. The changes show on the document as change bars in the template's colors (DOCE-TEMPLATES-5.8) and, in markup, with the words and blocks that changed marked in place.

## DOCE-VERSIONS-1 - Comparing versions

### DOCE-VERSIONS-1.1 - Inserted, deleted and modified blocks

`compareVersions(older, newer)` shall give the changes from the older version to the newer one in the newer one's order: each block only the newer holds as an `insertion`, each block only the older holds as a `deletion`, and each block both hold whose text changed as a `modification`, with its element id, its parts in the newer version, its text and its older text. Two equal versions shall give no change.

Implementation: `src/engine/version-compare.ts`, `src/engine/common-subsequence.ts`
Verification: `src/engine/version-compare.test.ts`

### DOCE-VERSIONS-1.2 - Moves and formatting

A block both versions hold that left the longest run of blocks kept in order shall be a `move`; one whose text is unchanged but whose attributes or text formatting changed shall be `formatting`.

Implementation: `src/engine/version-compare.ts`
Verification: `src/engine/version-compare.test.ts`

### DOCE-VERSIONS-1.3 - Where deletions go

A deleted block shall be placed before the next block of the older version the newer one still holds, or after the newer version's last block when none follows.

Implementation: `src/engine/version-compare.ts`
Verification: `src/engine/version-compare.test.ts`

### DOCE-VERSIONS-1.4 - Review marks left out

A block's text shall be compared with every suggestion rejected, and comment anchors, suggestion marks and contributor marks shall not count as formatting.

Implementation: `src/engine/version-compare.ts`
Verification: `src/engine/version-compare.test.ts`

### DOCE-VERSIONS-1.5 - Word by word

A changed block's text shall be compared word by word (`diffText`), spaces and punctuation as words of their own, giving the runs it kept, inserted and deleted in order. A word changed only by characters added to or removed from it shall keep the characters it shares.

Implementation: `src/engine/text-diff.ts`, `src/engine/common-subsequence.ts`
Verification: `src/engine/version-compare.test.ts`

### DOCE-VERSIONS-1.6 - Suggestions accepted

Asked to (`compareVersions(older, newer, { suggestions: 'accepted' })`, or a comparison's `suggestions` in the editor), the versions shall be compared with every suggestion accepted: the text a suggestion deletes left out, the text and blocks it inserts compared.

Implementation: `src/engine/version-compare.ts`, `src/engine/version-changes.ts`, `src/components/document-editor/use-document-layout.ts`
Verification: `src/engine/version-compare.test.ts`

### DOCE-VERSIONS-1.7 - Containers

A block both versions hold whose containers changed (wrapped in or taken out of a list, a table or a quote, moved between them, or in a container whose kind or attributes changed, such as a list's kind or a cell's span) shall be marked `structureChanged`. With its text unchanged it shall be `formatting`; with its text changed, a `modification` whose `formatChanged` is set.

Implementation: `src/engine/version-blocks.ts`, `src/engine/version-compare.ts`
Verification: `src/engine/version-compare.test.ts`

### DOCE-VERSIONS-1.8 - Blocks without ids

A block without an element id that the older version does not hold alike shall be paired with the block without an id of the older version whose words it is likest, when at least half of their words are shared, and compared with it as one block. A block of the same kind shall win a tie, and each older block shall pair once.

Implementation: `src/engine/version-pairing.ts`, `src/engine/version-compare.ts`
Verification: `src/engine/version-compare.test.ts`

### DOCE-VERSIONS-1.9 - Links and references

A block whose links point elsewhere, or whose references cite something else, shall be a `modification` whose `targets` names `link`, `reference` or both, even when its text and formatting are unchanged. A link's or a reference's target shall not count as formatting, and a reference's status (broken, its baseline and its label) shall not count as a target.

Implementation: `src/engine/version-blocks.ts`, `src/engine/version-compare.ts`
Verification: `src/engine/version-compare.test.ts`

### DOCE-VERSIONS-1.10 - Generated values

Values the document generates shall not count as a change: a reference's text, a variable's value, a script's output, a footnote's number, a template block's rendered markup and a contents block's entry range. Asked to (`compareVersions(older, newer, { generated: true })`), a block whose only change is in such values shall be a `modification` marked `generated`.

Implementation: `src/engine/version-blocks.ts`, `src/engine/version-compare.ts`
Verification: `src/engine/version-compare.test.ts`

## DOCE-VERSIONS-2 - Showing changes

### DOCE-VERSIONS-2.1 - Decorations

`versionChangeDecorations(doc, changes, display)` shall mark each changed block's parts with `data-diff-change` and the block before which, or after which, blocks were deleted with `data-diff-deletion`. A block whose text changed shall also be marked `data-diff-lines`, `formatting` when its formatting changed too, else `kept`, and what changed in it marked by kind (`data-diff-line`, from `changeLineMarks`): a run inserted (`insertion`), a run replacing deleted text (`modification`), and where text was deleted without a replacement (`deletion`). In `markup` it shall also mark inserted words (`data-diff-change="insertion"`), show deleted words as `del` elements where they were, and show each deleted block's text as a `del` element with `data-diff-block` inside the block it is placed at; in `bars` it shall do neither.

Implementation: `src/engine/version-changes.ts`
Verification: `src/engine/version-compare.test.ts`

### DOCE-VERSIONS-2.2 - Following the document

`createVersionChanges({ previous, display })` shall compare the document with the older version `previous` gives after each change and show the changes; without an older version it shall show none. A transaction marked with `refreshVersionChanges` shall read the older version and the display again, and `versionChanges(state)` shall give the changes shown.

Implementation: `src/engine/version-changes.ts`
Verification: `src/engine/version-compare.test.ts`

### DOCE-VERSIONS-2.3 - In the document editor

The document editor shall run the version changes in its view and its measuring view, compare the document with `compare.previous` in `compare.display`, marking its root with `data-comparing`, and lay the pages out again when either changes.

Implementation: `src/components/document-editor/use-document-layout.ts`, `src/components/document-editor/document-editor.tsx`
Verification: `e2e/versions.spec.ts`

### DOCE-VERSIONS-2.4 - Changed lines

`createChangeLines()` shall draw, inside each block it is given lines for (`setChangeLines`), a bar for each line (`de-change-lines__line`) with its kind (`data-diff-line`) and its top and height from the block's top (`--de-change-line-top`, `--de-change-line-height`), and keep the lines where their blocks go until they are set again. Changes on one line merge into the strongest (`strongerChange`): a modification, then an insertion, a deletion and a formatting change. The document editor shall install it, and, while the document shows changes, measure the lines of each block whose text changed after each render: a line takes the strongest change marked on it, a deleted block's text the deletion, blocks deleted before or after a block whose text does not show its first or last line, and every line of a block whose formatting changed too at least the formatting; each line reaches halfway to the next, so the bars of successive lines meet. A kind of change the template's change bars turn off where the block is (its section's setting, or else the template's) shall not count, so it never hides a shown kind on the same line.

Implementation: `src/engine/change-lines.ts`, `src/components/document-editor/change-lines-measure.ts`
Verification: `src/engine/change-lines.test.ts`, `src/components/document-editor/change-lines-measure.test.ts`, `e2e/versions.spec.ts`

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

## Hooks

| Hook                      | Kind      | Values                                                        | Description                                                     |
| ------------------------- | --------- | ------------------------------------------------------------- | --------------------------------------------------------------- |
| `data-comparing`          | state     | `markup`, `bars`                                              | On the editor while it shows changes from an older version.     |
| `data-diff-change`        | attribute | `insertion`, `deletion`, `modification`, `formatting`, `move` | On a changed block, an inserted word or a deleted text.         |
| `data-diff-deletion`      | attribute | `before`, `after`                                             | On the block before which, or after which, blocks were deleted. |
| `data-diff-block`         | attribute | `true`                                                        | On a deleted block's text.                                      |
| `data-diff-lines`         | attribute | `kept`, `formatting`                                          | On a block whose text changed: what its other lines show.       |
| `data-diff-line`          | attribute | `insertion`, `deletion`, `modification`, `formatting`         | On a changed word, where text was deleted, or a line's bar.     |
| `de-change-lines`         | root      |                                                               | The bars beside a block's changed lines.                        |
| `de-change-lines__line`   | slot      |                                                               | One changed line's bar.                                         |
| `--de-change-line-top`    | property  |                                                               | The line's top from the block's top, in pixels.                 |
| `--de-change-line-height` | property  |                                                               | The line's height, in pixels.                                   |
