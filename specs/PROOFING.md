# Proofing

A host's text proofers, such as a spelling and grammar checker and an abbreviation checker, reach the editor through the `proofer` adapter (DOCE-HOST-1.7). `createProofing({ proofer })` returns the plugin that hands them the document's text and marks the issues it finds; the document editor shows them, offers their corrections in its context menu and counts them in its status bar. Proofing marks take no room, so they never change the pages.

## DOCE-PROOFING-1 - Checking the text

### DOCE-PROOFING-1.1 - What is checked

The plugin shall check the text of each textblock of the document, its pages' bodies and footnote areas, as one text per block: each object in a block, and text in code or deleted by a suggestion, reads as spaces, and an inline atom with text of its own (`leafText`) reads as that text, so each character of the text maps to the block's character or atom it reads. An issue wholly in an atom's text is not shown. Page headers and footers, code blocks and display math are left out, and so is a block holding only spaces.

Implementation: `src/engine/proofing.ts`, `src/engine/proofing-text.ts`
Verification: `src/engine/proofing.test.ts`, `src/engine/host-domain-recipe.test.ts`

### DOCE-PROOFING-1.2 - Results and marks

A short while after the document changes, and as long after it starts (`delay`, 500 milliseconds by default), the plugin shall hand the proofer the texts it has not checked yet, at most `batch` (50) at a time and one check at a time, with a signal that aborts once the document changes again. It shall keep each text's issues by its text, so a block the pages move or split back, or a text typed back, is not checked again, and drop those of texts the document no longer holds. Each issue is marked by an inline decoration carrying `data-proofing-issue` with its kind (`spelling`, `grammar` or `style`). `listProofingIssues(state)` lists the marked issues in document order and `proofingIssueAt(state, pos)` the one at a position; `isProofingPending(state)` is true while some text waits to be checked. A check that fails marks nothing in its texts, which count as checked. The editor's hidden measuring view does not proof.

Implementation: `src/engine/proofing.ts`, `src/engine/proofing-commands.ts`, `src/components/document-editor/use-document-layout.ts`
Verification: `src/engine/proofing.test.ts`, `e2e/proofing.spec.ts`

### DOCE-PROOFING-1.3 - Changed text

A change shall move the marks with their text and drop each mark whose text it changed, which waits for that text's next check; the cost does not grow with the number of steps a change takes, such as a new layout of the pages. Each block's text is read once for as long as the block lasts.

Implementation: `src/engine/proofing.ts`
Verification: `src/engine/proofing.test.ts`

### DOCE-PROOFING-1.4 - Committing results

The plugin shall dispatch its results as transactions holding nothing else, one per check. Results that come back while a pointer button is down on the editor wait for its release, so they never redraw the selection a drag is making. `proofingUpdate(tr)` shall return, for such a transaction, the update that commits it on the latest state, and null for any other; the document editor commits them so, since its view may still show a state the writer has since typed past.

Implementation: `src/engine/proofing.ts`, `src/components/document-editor/document-editor.tsx`
Verification: `src/engine/proofing.test.ts`

### DOCE-PROOFING-1.5 - Batches and segments

A check shall take at most `batch` texts (50) and `batchLength` characters (6000), and at least one block; a block longer than `textLength` (2000) is checked in segments ending after a sentence or, failing one, a space (`segmentsOf`), whose issues are placed back at their offsets in the block's text. Each text goes with its language: the block's own, or the document's (`language`).

Implementation: `src/engine/proofing-text.ts`, `src/engine/proofing-view.ts`
Verification: `src/engine/proofing.test.ts`

### DOCE-PROOFING-1.6 - Several proofers and their status

`proofer` may be several proofers: each checks every batch, and their issues are marked together, each remembering its proofer. A proofer that fails marks nothing, and the state's `status` says whether all proofers answered the latest check (`ready`), some (`degraded`) or none (`unavailable`); its texts count as checked, and `recheckProofing` checks every text again. A change `isRemote` reports, such as a collaborator's, never aborts a running check.

Implementation: `src/engine/proofing.ts`, `src/engine/proofing-view.ts`, `src/engine/proofing-commands.ts`
Verification: `src/engine/proofing.test.ts`, `e2e/proofing.spec.ts`

## DOCE-PROOFING-2 - Commands

### DOCE-PROOFING-2.1 - Correcting

`replaceProofingIssue(issue, replacement)` shall put the replacement in place of the issue's text, keeping its marks, and leave the caret after it; it is refused once the issue's text is no longer there.

Implementation: `src/engine/proofing-commands.ts`
Verification: `src/engine/proofing.test.ts`

### DOCE-PROOFING-2.2 - Ignoring and the dictionary

`ignoreProofingIssue(issue)` shall stop marking the issue's text anywhere in the document for as long as the editor is open, out of the history. `addProofingWord(issue)` shall, for a spelling issue and a proofer that keeps a dictionary (`addWord`), add the word to it and ignore it.

Implementation: `src/engine/proofing-commands.ts`
Verification: `src/engine/proofing.test.ts`

### DOCE-PROOFING-2.3 - The next issue

`selectNextProofingIssue` shall select the first issue starting at or after the selection's end, or the first issue when none does, and is refused while no issue is marked.

Implementation: `src/engine/proofing-commands.ts`
Verification: `src/engine/proofing.test.ts`

### DOCE-PROOFING-2.4 - Replacing all

`replaceAllProofingIssues(issue, replacement)` shall put the replacement in place of every marked issue like it, the same text found by the same rule or of the same kind without one, as one change; `countAlikeIssues` counts them.

Implementation: `src/engine/proofing-commands.ts`
Verification: `src/engine/proofing.test.ts`, `e2e/proofing.spec.ts`

### DOCE-PROOFING-2.5 - Ignoring once

`ignoreProofingOnce(issue)` shall stop marking that one issue, by its block's text and its offsets there, for as long as the editor is open, leaving the issues like it marked.

Implementation: `src/engine/proofing-commands.ts`, `src/engine/proofing.ts`
Verification: `src/engine/proofing.test.ts`

### DOCE-PROOFING-2.6 - Turning a rule off

`disableProofingRule(issue)` shall stop marking the issues its rule finds, and tell its proofer (`ignoreRule`) when that keeps the reader's choice.

Implementation: `src/engine/proofing-commands.ts`
Verification: `src/engine/proofing.test.ts`, `e2e/proofing.spec.ts`

### DOCE-PROOFING-2.7 - The language

`setProofingLanguage(language)` shall check every text again in the language picked, and is refused for the language already used. `proofingLanguages(state)` lists the languages the proofers offer, each once.

Implementation: `src/engine/proofing-commands.ts`
Verification: `src/engine/proofing.test.ts`, `e2e/proofing.spec.ts`

## DOCE-PROOFING-3 - In the editor

### DOCE-PROOFING-3.1 - Status

While the document is proofed, the status bar (DOCE-EDITOR-5.1) shall show the proofing status (`de-document-editor__proofing-status`, the `proofingStatus` label): checking, no issues, or how many; pressing it selects the next issue and keeps focus in the document. It publishes `data-pending` while text waits to be checked and `data-issues` while issues are marked.

Implementation: `src/components/document-editor/status-items.tsx`, `labs/reference/editor-chrome.css`
Verification: `e2e/proofing.spec.ts`

### DOCE-PROOFING-3.2 - The context menu

In an editable document, the context menu opened on an issue shall lead with a section titled by the issue's message, or its kind (`proofingIssue`), offering up to five of its suggestions (or `noSuggestions`), then, when other issues are like it, a submenu (`replaceAll`) replacing them all with one of those suggestions; Ignore, for this issue alone; Ignore all, for its word; for a spelling issue and a proofer with a dictionary, Add to dictionary; and, for an issue with a rule, turning the rule off.

Implementation: `src/components/document-editor/context-entries.ts`, `src/components/document-editor/proofing-entries.ts`
Verification: `e2e/proofing.spec.ts`

### DOCE-PROOFING-3.3 - A word-list proofer

`createWordListProofer({ corrections, grammar })` shall flag each word listed in `corrections` (or in `byLanguage` for a text in that language) as an issue of its `kind`, spelling by default, whose suggestions are its corrections, capitalized as the word is, and each phrase listed in `grammar` as a grammar issue with its message and suggestions, found by a rule named by the phrase, ignoring case; a word added to its dictionary, and a rule turned off, are no longer flagged. It offers its `languages`. It stands in for a host's proofer in tests and labs.

Implementation: `src/host/word-list-proofer.ts`
Verification: `src/engine/proofing.test.ts`

### DOCE-PROOFING-3.4 - Several proofers in the editor

The editor shall mark the issues of every proofer together and offer each issue's entries for its own proofer: its dictionary and its rules.

Implementation: `src/components/document-editor/proofing-entries.ts`
Verification: `e2e/proofing.spec.ts`

### DOCE-PROOFING-3.5 - Picking the language

While the document is proofed, the status bar shall show the proofing menu (`de-document-editor__proofing-language`, named by `proofingLanguage`): a button showing the language the document is proofed in, opening a menu of the languages the proofers offer, the one in use checked, that checks the document again in the language picked. The proofing status says when the proofers do not answer (`proofingUnavailable`, `proofingDegraded`) and publishes the status in `data-status`.

Implementation: `src/components/document-editor/status-items.tsx`
Verification: `e2e/proofing.spec.ts`

### DOCE-PROOFING-3.6 - Revealing and announcing issues

Once the proofing status has selected the next issue, the editor shall centre the issue in the window as far as the document scrolls and mark it with `data-proofing-flash` for `PROOFING_FLASH` milliseconds (`revealSelectedProofingIssue`), and read out its message, or kind, its text and where it stands among the issues (`proofingIssueAnnouncement`) through the editor's live regions (DOCE-EDITOR-5.6). Each issue count the proofers settle on after the first is read out (`proofingStatus`).

Implementation: `src/engine/proofing-commands.ts`, `src/components/document-editor/status-items.tsx`, `src/components/document-editor/editor-labels.ts`
Verification: `e2e/proofing.spec.ts`

## Hooks

| Hook                  | Kind      | Values                         | Description                                          |
| --------------------- | --------- | ------------------------------ | ---------------------------------------------------- |
| `data-proofing-issue` | attribute | `spelling`, `grammar`, `style` | On the text of an issue: what it is about.           |
| `data-proofing-flash` | attribute | `true`                         | On the text of an issue just revealed, for a moment. |
