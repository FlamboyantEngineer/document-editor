# Proofing

A host's text proofers, such as a spelling and grammar checker and an abbreviation checker, reach the editor through the `proofer` adapter (DOCE-HOST-1.7). `createProofing({ proofer })` returns the plugin that hands them the document's text and marks the issues it finds; the document editor shows them, offers their corrections in its context menu and counts them in its status bar. Proofing marks take no room, so they never change the pages.

## DOCE-PROOFING-1 - Checking the text

### DOCE-PROOFING-1.1 - What is checked

The plugin shall check the text of each textblock of the document, its pages' bodies and footnote areas, as one text per block: each object in a block, and text in code or deleted by a suggestion, reads as spaces, and an inline atom with text of its own (`leafText`) reads as that text, so each character of the text maps to the block's character or atom it reads. An issue wholly in an atom's text is not shown. Page headers and footers, code blocks and display math are left out, and so is a block holding only spaces.

Implementation: `src/engine/proofing.ts`, `src/engine/proofing-text.ts`
Verification: `src/engine/proofing.test.ts`, `src/engine/host-domain-recipe.test.ts`, `src/engine/proofing-options.test.ts`

### DOCE-PROOFING-1.2 - Results and marks

A short while after the document changes, and as long after it starts (`delay`, 500 milliseconds by default), the plugin shall hand the proofers the texts it has not checked yet, one batch at a time, with a signal that aborts once the document changes again. It shall keep results by text and effective language while the document uses them. Identical paragraphs in the same language share a provider result and display their own issue marks. Each issue is marked by an inline decoration carrying `data-proofing-issue` with its kind (`spelling`, `grammar` or `style`), `data-proofing-category` with the proofer's finer category (such as `punctuation`, `capitalization` or `repeated-word`), or its kind without one, and `data-proofing-rule` with the id of the rule that found it, when it has one. `listProofingIssues(state)` lists the marked issues in document order, by where they start, then end, so issues over the same text stay apart, and `proofingIssueAt(state, pos)` the one at a position. `isProofingPending(state)` is true while some text waits to be checked. A check that fails marks nothing in its texts, which count as checked. The editor's hidden measuring view does not proof.

Implementation: `src/engine/proofing.ts`, `src/engine/proofing-commands.ts`, `src/components/document-editor/use-document-layout.ts`
Verification: `src/engine/proofing.test.ts`, `e2e/proofing.spec.ts`, `src/engine/proofing-options.test.ts`

### DOCE-PROOFING-1.3 - Changed text

A change shall move the marks with their text and drop each mark whose text it changed, which waits for that text's next check; the cost does not grow with the number of steps a change takes, such as a new layout of the pages. Each block's text is read once for as long as the block lasts.

Implementation: `src/engine/proofing.ts`
Verification: `src/engine/proofing.test.ts`

### DOCE-PROOFING-1.4 - Committing results

The plugin shall dispatch its results as transactions holding nothing else, after completing all requests for a group of blocks. Results that come back while a pointer button is down on the editor wait for its release (a mouseup, the end of a native drag or drop, or the window losing focus), so they never redraw the selection a drag is making. `proofingUpdate(tr)` shall return, for such a transaction, the update that commits it on the latest state, and null for any other. A result from before an explicit recheck or language change is dropped.

Implementation: `src/engine/proofing.ts`, `src/components/document-editor/document-editor.tsx`
Verification: `src/engine/proofing.test.ts`

### DOCE-PROOFING-1.5 - Batches and segments

A provider call shall take at most `batch` texts (50) and `batchLength` characters (6000) after segmentation. A block longer than `textLength` (2000) or `batchLength` is checked in segments, ending after a sentence or a space when possible (`segmentsOf`). Issues are placed back at their offsets in the block's text. Each text goes with its language: the block's own, or the document's (`language`).

Implementation: `src/engine/proofing-text.ts`, `src/engine/proofing-view.ts`, `src/engine/proofing-batches.ts`
Verification: `src/engine/proofing.test.ts`, `src/engine/proofing-options.test.ts`

### DOCE-PROOFING-1.6 - Several proofers and their status

`proofer` may be several proofers: each checks every batch, and their issues are marked together, each remembering its proofer. A proofer that fails marks nothing, and the state's `status` says whether all proofers answered the latest check (`ready`), some (`degraded`) or none (`unavailable`), and its `reason` why one did not, as the proofer's error says (`reason`, such as `timeout` or `not-configured`); its texts count as checked, and `recheckProofing` checks every text again. A change `isRemote` reports, such as a collaborator's, never aborts a running check.

Implementation: `src/engine/proofing.ts`, `src/engine/proofing-view.ts`, `src/engine/proofing-commands.ts`
Verification: `src/engine/proofing.test.ts`, `e2e/proofing.spec.ts`, `src/engine/proofing-options.test.ts`

### DOCE-PROOFING-1.7 - Technical tokens

The plugin shall not mark a spelling issue whose text is one technical token (`isTechnicalToken`): an acronym, such as `USB` or `APIs`, a part number or standard mixing letters and digits, such as `XB12C-Q7`, `4K60` or `ISO-8601`, capitals joined by hyphens or slashes, or an identifier with an underscore or a capital inside. The host replaces the test (`skip`) or marks every issue (`skip: null`); words the proofer's dictionary filters stay filtered as well.

Implementation: `src/engine/proofing-tokens.ts`, `src/engine/proofing.ts`
Verification: `src/engine/proofing-options.test.ts`

### DOCE-PROOFING-1.8 - When proofing is off

The document shall be proofed only while its editor is editable and the host's `isEnabled(state)`, when given, is true, so a historical view (DOCE-VERSIONS-5.1), a reading view, a static render and an export are never proofed. When proofing goes off, the running check is aborted, nothing more is checked, nothing is marked, `listProofingIssues` lists none, `isProofingPending` is false and the status shows nothing; the state's `enabled` says so. When it comes back on, the text not checked yet is checked at once.

Implementation: `src/engine/proofing.ts`, `src/engine/proofing-view.ts`, `src/engine/proofing-commands.ts`, `src/components/document-editor/status-items.tsx`
Verification: `src/engine/proofing-options.test.ts`, `src/components/document-editor/proofing-status.test.tsx`, `e2e/full-editor-options.spec.ts`

### DOCE-PROOFING-1.9 - The first check

The first check of the whole document shall wait `delay` after the editor starts, or, with `scheduleFirstCheck(run)`, until the host runs it, such as once its pages have painted or the browser is idle, a change before then, such as the pages being laid out, waiting for it too; the function it returns cancels it when the editor goes. Checks after a change wait `delay` as before.

Implementation: `src/engine/proofing-view.ts`
Verification: `src/engine/proofing-options.test.ts`, `e2e/full-editor-options.spec.ts`

## DOCE-PROOFING-2 - Commands

### DOCE-PROOFING-2.1 - Correcting

`replaceProofingIssue(issue, replacement)` shall put the replacement in place of the issue's text, keeping the marks on its first character, including a non-inclusive comment anchor, and leave the caret after it. An empty replacement deletes the issue's text. The command is refused once the issue's text is no longer there, when any part of its range is locked (DOCE-EDITING-4.1), or when it belongs to host-owned content. On pages, an issue in a later part of a paragraph split across them shall be drawn and corrected there as in the whole paragraph.

Implementation: `src/engine/proofing-commands.ts`, `src/engine/replace-text.ts`
Verification: `src/engine/proofing.test.ts`, `e2e/proofing.spec.ts`

### DOCE-PROOFING-2.2 - Ignoring and the dictionary

`ignoreProofingIssue(issue)` shall stop marking the issue's text anywhere in the document for as long as the editor is open, out of the history. `addProofingWord(issue)` shall, for any issue whose proofer keeps a dictionary (`addWord`), add its text to it and ignore it.

Implementation: `src/engine/proofing-commands.ts`
Verification: `src/engine/proofing.test.ts`

### DOCE-PROOFING-2.3 - The next issue

`selectNextProofingIssue` shall select the next of the document's issues (`listDocumentIssues`: the proofing issues and the abbreviations whose glossary entry needs the writer, DOCE-REFERENCES-2.3, in document order): the first starting at or after the selection's end before any was visited; after that, the one after the issue visited last (`visited`), so moving the caret does not lose the place, or, once that issue is gone, the first starting after where it was; and the first issue when none follows. Issues over the same text, and issues in tables, are visited one by one. It is refused while no issue is marked.

Implementation: `src/engine/proofing-commands.ts`, `src/engine/proofing.ts`
Verification: `src/engine/proofing.test.ts`, `src/engine/proofing-options.test.ts`

### DOCE-PROOFING-2.4 - Replacing all

`replaceAllProofingIssues(issue, replacement)` shall replace the editable marked issues with the same text and rule, or the same text and kind without a rule, as one change. Locked ranges and host-owned content stay marked. The command is refused when no editable range is left and skips any range the host locks during the batch. A range is replaced once even if several proofers report it. When editable ranges overlap, the first range in document order is replaced and the overlapping ones are skipped. Each replacement keeps the marks on its range’s first character (DOCE-PROOFING-2.1). An empty replacement deletes the chosen ranges. `countAlikeIssues` counts matching non-overlapping ranges before checking whether they are editable.

Implementation: `src/engine/proofing-commands.ts`, `src/engine/replace-text.ts`
Verification: `src/engine/proofing.test.ts`, `src/engine/proofing-options.test.ts`, `e2e/proofing.spec.ts`

### DOCE-PROOFING-2.5 - Ignoring once

`ignoreProofingOnce(issue)` shall stop marking one provider's issue at one occurrence while the editor is open. Other issues stay marked, including the same issue in identical paragraphs and the issues other providers report at the same range. An ignored occurrence follows edits that move its range.

Implementation: `src/engine/proofing-commands.ts`, `src/engine/proofing.ts`, `src/engine/proofing-ranges.ts`
Verification: `src/engine/proofing.test.ts`, `src/engine/proofing-options.test.ts`

### DOCE-PROOFING-2.6 - Turning a rule off

`disableProofingRule(issue)` shall stop marking the issues its rule finds, and tell its proofer (`ignoreRule`) when that keeps the reader's choice.

Implementation: `src/engine/proofing-commands.ts`
Verification: `src/engine/proofing.test.ts`, `e2e/proofing.spec.ts`

### DOCE-PROOFING-2.7 - The language

`setProofingLanguage(language)` shall check every text again in the language picked, and is refused for the language already used. `proofingLanguages(state)` lists the languages the proofers offer, each once.

Implementation: `src/engine/proofing-commands.ts`
Verification: `src/engine/proofing.test.ts`, `e2e/proofing.spec.ts`

### DOCE-PROOFING-2.8 - Keeping the reader's decisions

The plugin shall start with the words the reader ignores everywhere (`ignored`) and the rules they turned off (`disabledRules`) that the host kept, and tell the host each new one (`onDecision`, `{ kind: 'ignore', word }` or `{ kind: 'disable-rule', rule }`), so the host may keep them, per document or per reader, and give them back the next time; the document's content never holds them. Ignoring one issue alone is not told.

Implementation: `src/engine/proofing.ts`, `src/engine/proofing-commands.ts`
Verification: `src/engine/proofing-options.test.ts`, `e2e/full-editor-options.spec.ts`

## DOCE-PROOFING-3 - In the editor

### DOCE-PROOFING-3.1 - Status

While the document is proofed, or its abbreviations checked (DOCE-REFERENCES-2.3), and proofing is not off (DOCE-PROOFING-1.8), the status bar (DOCE-EDITOR-5.1) shall show the proofing status (`de-document-editor__proofing-status`, the `proofingStatus` label): checking while text waits to be checked, then no issues, or how many, counting the abbreviations whose glossary entry needs the writer (`listDocumentIssues`), a count already known staying beside checking (`2 issues · Checking…`) and beside a notice that the proofers do not answer (`proofingUnavailable`, `proofingDegraded`); pressing it selects the next issue and keeps focus in the document (`nextIssue`), and with no issue it is disabled but stays focusable, its tooltip saying so (`noIssue`). It publishes `data-checking` while text waits to be checked and `data-issues` while issues are marked.

Implementation: `src/components/document-editor/status-items.tsx`, `labs/reference/editor-chrome.css`, `src/engine/proofing-commands.ts`
Verification: `e2e/proofing.spec.ts`, `src/components/document-editor/proofing-status.test.tsx`

### DOCE-PROOFING-3.2 - The context menu

In an editable document, the context menu opened on an issue's mark the view draws, or from the keyboard with the caret in an issue, shall lead with a submenu (`proofingMenu`) holding a section titled by the issue's message, or its kind (`proofingIssue`), offering up to five of its suggestions (or `noSuggestions`); a submenu (`replaceAll`) replacing every issue like it with one of those suggestions; Ignore, for this issue alone; Ignore all, for its word; Add to dictionary; and turning its rule off. Empty suggestions use the editor's Delete label in both menus. An entry that does not apply, Replace all with fewer than two matching ranges, no editable range or no suggestion, Add to dictionary for a proofer without a dictionary, turning the rule off for an issue without one, is disabled rather than left out. Opened on text without a mark, the menu has no proofing submenu, even where the state holds an issue the view does not draw; opened on a mark the state no longer holds, the submenu shows `noSuggestions` with every entry disabled. The menu's other groups, a table cell's among them, follow it. The labels are the host's to replace (`DocumentEditorLabels`).

Implementation: `src/components/document-editor/context-entries.ts`, `src/components/document-editor/proofing-entries.ts`, `src/components/document-editor/document-context-menu.tsx`, `src/components/document-editor/context-target.ts`
Verification: `e2e/proofing.spec.ts`, `src/components/document-editor/proofing-entries.test.ts`

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

Once the proofing status has selected the next issue, the editor shall centre the issue in the window as far as the document scrolls and mark it with `data-proofing-flash` for `PROOFING_FLASH` milliseconds (`revealSelectedProofingIssue`), as a decoration of the proofing state that the view draws, so the view drawing the issue again keeps the mark, and read out its message, or kind, its text and where it stands among the issues (`proofingIssueAnnouncement`) through the editor's live regions (DOCE-EDITOR-5.6). Each issue count the proofers settle on after the first is read out (`proofingStatus`).

Implementation: `src/engine/proofing-commands.ts`, `src/components/document-editor/status-items.tsx`, `src/components/document-editor/editor-labels.ts`
Verification: `e2e/proofing.spec.ts`, `src/engine/proofing.test.ts`

## Hooks

| Hook                     | Kind      | Values                              | Description                                          |
| ------------------------ | --------- | ----------------------------------- | ---------------------------------------------------- |
| `data-proofing-issue`    | attribute | `spelling`, `grammar`, `style`      | On the text of an issue: what it is about.           |
| `data-proofing-category` | attribute | the proofer's category, or the kind | On the text of an issue: its finer category.         |
| `data-proofing-rule`     | attribute | a rule id                           | On the text of an issue found by a rule: the rule.   |
| `data-proofing-flash`    | attribute | `true`                              | On the text of an issue just revealed, for a moment. |
