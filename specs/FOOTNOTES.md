# Footnotes

Inserting footnotes, keeping their entries with their markers and in order, numbering them, typing beside a marker, pasting where footnotes have rules, and moving between a marker and its entry. The pages place each entry on the page that cites it (DOCE-PAGINATION-7.2).

## DOCE-FOOTNOTES-1 - Footnotes in the text

### DOCE-FOOTNOTES-1.1 - Inserting a footnote

`insertFootnote()` shall insert a footnote at the caret: its marker in the text, in place of the selection, and an empty entry in the footnote area of the page, before the entries of footnotes cited after it, so the area lists its entries in marker order, with the caret in the entry; its view numbers both (DOCE-FOOTNOTES-2.2). A marker inserted inside a comment or a suggestion, whose marks the text on both sides of the caret carries, takes those marks, so it belongs to that comment or suggestion. Mod-Alt-F inserts one. An entry is one run of text: it takes inline formatting, the toolbar offers no block objects in it, Enter and Shift+Enter add nothing, and an entry whose text is all deleted stays, empty, while its marker does.

Implementation: `src/engine/footnotes.ts`, `src/engine/document-editing.ts`
Verification: `src/engine/footnotes.test.ts`, `e2e/objects.spec.ts`, `e2e/session.spec.ts`

### DOCE-FOOTNOTES-1.2 - Where a footnote may be cited

A footnote may be cited in a paragraph of the page's body, in a figure's, table's or code block's caption, and in a paragraph or caption whose every enclosing block, up to the page's content, is a list, a body or header cell of a table, a figure, a table or code block with its caption, a quote or a layout column (`canInsertFootnote`); the footnotes are numbered in reading order, a caption's with the text around it; elsewhere, in a heading, a code block's code, a script block's output, a footnote entry, a page header or footer, or the caption the pages repeat on a later part of a split table or code block, which is not edited, inserting one is refused. `createFootnotes({ citingPlaces })`, and the same option of the editing plugins (`createDocumentEditing`), shall replace those enclosing blocks with the host's list of node type names.

Implementation: `src/engine/footnote-model.ts`, `src/engine/footnotes.ts`, `src/engine/footnote-plugins.ts`
Verification: `src/engine/footnotes.test.ts`, `src/engine/document-editing.test.ts`, `e2e/full-editor-options.spec.ts`

### DOCE-FOOTNOTES-1.3 - Entries follow their markers

After each of the writer's changes, `createFootnotes()`, which the editing plugins install, shall reconcile the footnotes in one walk of the document:

- an entry whose marker is gone is deleted, and its text kept for the session, so a marker that is cut and pasted gets its text back;
- a marker with no entry gets one in its page's footnote area, with its kept text or empty;
- a marker in another section than its entry, as after its paragraph is moved there, takes the entry to its own footnote area, with its text;
- a marker repeated for one id, as a copy and paste makes, keeps its id where the original was, and each copy becomes a footnote of its own with a new id and a copy of the text;
- an entry repeated for one id is deleted;
- each footnote area lists its entries in marker order.

It sets no number: each view numbers the footnotes it shows (DOCE-FOOTNOTES-2.2).

Changes that only type or delete text inside one text block (`isInlineTextOnly`) shall not walk the document, and remote changes (`isRemote`, `isRemoteTransaction` by default) are left to the writer who made them.

Implementation: `src/engine/footnotes.ts`, `src/engine/footnote-reconcile.ts`, `src/engine/document-editing.ts`
Verification: `src/engine/footnote-reconcile.test.ts`, `e2e/shared-room.spec.ts`

### DOCE-FOOTNOTES-1.4 - Finding, editing and deleting

`listFootnotes(doc)` shall give each footnote's marker and entry positions by id, `footnoteAt(state)` the footnote whose marker is selected or whose entry holds the selection, `editFootnote(id)` put the caret at the end of its entry, `goToFootnoteMarker(id)` put the caret after its marker, and `deleteFootnote(id)` delete both. Backspace after a marker or with it selected, and Delete before it, delete the marker, and its entry goes with it (DOCE-FOOTNOTES-1.3). The part the reader arrives at carries `data-de-revealed` (`entry` or `marker`) until the writer moves the selection or edits.

Implementation: `src/engine/footnotes.ts`
Verification: `src/engine/footnotes.test.ts`, `e2e/objects.spec.ts`

### DOCE-FOOTNOTES-1.5 - Typing beside a marker

A marker is not text: with the caret just after a marker, or before one that starts its block, typing shall take the marks of the text before the marker, or at the start of a block of the text after it, as if the marker were not there. A mark that ends at its text, such as a link, carries on only when the text on both sides has it. Marks the writer chose for the caret are kept.

Implementation: `src/engine/footnote-marks.ts`, `src/engine/footnotes.ts`
Verification: `src/engine/footnote-marks.test.ts`

### DOCE-FOOTNOTES-1.6 - Pasting where footnotes have rules

`flattenFootnotePaste(slice, state)`, which the paste pipeline runs, shall repair pasted content by the footnote places (D13): pasted into a footnote entry, it becomes one run of text, its blocks joined by a space, keeping the inline content and marks an entry allows and no markers; pasted elsewhere, markers are kept only in paragraphs that may cite a footnote (DOCE-FOOTNOTES-1.2). Content that joins the block at the caret, inline content and the text block an open slice starts with, keeps its markers only where the caret may cite one; the slice's whole blocks land beside that block and keep theirs where a paragraph there may cite one, so paragraphs pasted or moved with the caret in a heading keep their footnotes. It returns the slice unchanged when nothing needs repair.

Implementation: `src/engine/footnote-paste.ts`
Verification: `src/engine/footnote-paste.test.ts`

### DOCE-FOOTNOTES-1.7 - Showing the other part by double click

A double click on a marker shall show its entry, and a double click on an entry's number its marker, without moving the caret or the selection, in an editable or a read-only editor: the part shown scrolls into view and carries `data-de-revealed` (`entry` or `marker`) for `FOOTNOTE_FLASH_MS` (1500 ms). The change is not an undo step.

Implementation: `src/engine/footnotes.ts`
Verification: `src/engine/footnotes.test.ts`

## DOCE-FOOTNOTES-2 - Numbers each view shows

### DOCE-FOOTNOTES-2.1 - Numbers through the document, in each section or on each page

`numberFootnoteParts(doc, numbering)` shall give each footnote marker and entry of a document its number: its footnote's place, from 1, in the order of the markers' first citations in reading order (a caption's with the text around it), through the document (`document`, the default), from 1 in each section, read through the document structure (`section`, a layout without pages, where each section is one page), or from 1 on each page (`page`). A part whose footnote no marker in its section or page cites has none. `DocumentEditor` shall number the footnotes in each section in the web layout of a template that numbers footnotes on each page, and through the document otherwise, number them again when it enters the web layout or the template changes, whatever template the state's plugins were given; on pages the pages number them (DOCE-PAGINATION-7.2).

Implementation: `src/engine/footnote-numbers.ts`, `src/components/document-editor/use-document-layout.ts`
Verification: `src/engine/footnote-numbers.test.ts`, `src/components/document-editor/document-editor.test.tsx`, `e2e/regression.spec.ts`

### DOCE-FOOTNOTES-2.2 - Numbers are not content

A footnote's number shall be no part of the document: the schema gives markers and entries no number, so no transaction sets one, and the editing state, a shared room, the stored file and a version hold none. `createFootnoteNumbers({ numbering })`, which the editing extension installs (DOCE-EDITING-3.1) to number in each section when its template numbers footnotes on each page and through the document otherwise (`unpagedNumbering`), shall draw the numbers on its view as decorations: the number as the marker's text and as the text of the entry's number (`.pm-footnote-entry-number`), and `data-footnote-number` and the tooltip (`Footnote n`, in the schema's tooltip attribute) on the marker and the entry, so a stylesheet reads the same hooks in every layout; `footnoteNumberOf(decorations)` gives a host's own node view its number. They shall be counted again after any change but typing or deleting text inside one text block (`isInlineTextOnly`), which moves no marker and only maps them, so typing pays no footnote lookup, and after a transaction marked with `renumberFootnotes(tr, numbering?)`, whose numbering, when given, holds from then on (null shows none). The pages and the view that measures them number their own (`withFootnoteNumbers`, DOCE-PAGINATION-7.2). A remote change is numbered as a local one and nothing is written back, so writers whose layouts number differently send nothing for each other's footnotes. A footnote marker or entry written as markup, without a view, carries its id and no number; the static render numbers them as the editor does (DOCE-EDITOR-6.27).

Implementation: `src/engine/footnote-numbers.ts`, `src/engine/document-editing.ts`, `src/model/schema/footnote-nodes.ts`
Verification: `src/engine/footnote-numbers.test.ts`, `src/collab/sync.test.ts`, `src/collab/room-change-guard.test.ts`, `e2e/shared-room.spec.ts`

## DOCE-FOOTNOTES-3 - Footnotes on pages

### DOCE-FOOTNOTES-3.1 - Typing in an entry

Typing in a footnote entry that leaves its height as it was shall leave every entry on the page it was on, and the entry shall keep drawing its number while the writer types; inserting a footnote lays its page out again in the same layout (DOCE-PAGINATION-7.2).

Implementation: `src/pagination/layout-document.ts`, `src/pagination/measure-footnotes.ts`, `src/model/schema/footnote-nodes.ts`
Verification: `e2e/regression.spec.ts`

## Hooks

| Hook               | Kind      | Values            | Description                                                                  |
| ------------------ | --------- | ----------------- | ---------------------------------------------------------------------------- |
| `data-de-revealed` | attribute | `entry`, `marker` | On the footnote entry or marker the reader was taken to, until they move on. |
