# Footnotes

Inserting footnotes, keeping their entries with their markers and in order, numbering them, typing beside a marker, pasting where footnotes have rules, and moving between a marker and its entry. The pages place each entry on the page that cites it (DOCE-PAGINATION-7.2).

## DOCE-FOOTNOTES-1 - Footnotes in the text

### DOCE-FOOTNOTES-1.1 - Inserting a footnote

`insertFootnote()` shall insert a footnote at the caret: its marker in the text, in place of the selection, and an empty entry in the footnote area of the page, before the entries of footnotes cited after it, so the area lists its entries in marker order, both numbered in document order, with the caret in the entry. Mod-Alt-F inserts one.

Implementation: `src/engine/footnotes.ts`
Verification: `src/engine/footnotes.test.ts`

### DOCE-FOOTNOTES-1.2 - Where a footnote may be cited

A footnote may be cited in a paragraph of the page's body, and in a paragraph whose every enclosing block, up to the page's content, is a list, a body cell of a table, a quote or a layout column (`canInsertFootnote`); elsewhere, in a heading, a code block, a header cell, a script block's output, a footnote entry or a page header or footer, inserting one is refused. `createFootnotes({ citingPlaces })` shall replace those enclosing blocks with the host's list of node type names.

Implementation: `src/engine/footnote-model.ts`, `src/engine/footnotes.ts`
Verification: `src/engine/footnotes.test.ts`

### DOCE-FOOTNOTES-1.3 - Entries follow their markers

After each of the writer's changes, `createFootnotes()`, which the editing plugins install, shall reconcile the footnotes in one walk of the document:

- an entry whose marker is gone is deleted, and its text kept for the session, so a marker that is cut and pasted gets its text back;
- a marker with no entry gets one in its page's footnote area, with its kept text or empty;
- a marker in another section than its entry, as after its paragraph is moved there, takes the entry to its own footnote area, with its text;
- a marker repeated for one id, as a copy and paste makes, keeps its id where the original was, and each copy becomes a footnote of its own with a new id and a copy of the text;
- an entry repeated for one id is deleted;
- each footnote area lists its entries in marker order;
- unless the template numbers footnotes on each page, the markers and entries are numbered in document order, so the web layout numbers them too.

Changes that only type or delete text inside one text block (`isInlineTextOnly`) shall not walk the document, and remote changes (`isRemote`, `isRemoteTransaction` by default) are left to the writer who made them.

Implementation: `src/engine/footnotes.ts`, `src/engine/footnote-reconcile.ts`, `src/engine/document-editing.ts`
Verification: `src/engine/footnote-reconcile.test.ts`

### DOCE-FOOTNOTES-1.4 - Finding, editing and deleting

`listFootnotes(doc)` shall give each footnote's marker and entry positions by id, `footnoteAt(state)` the footnote whose marker is selected or whose entry holds the selection, `editFootnote(id)` put the caret at the end of its entry, `goToFootnoteMarker(id)` put the caret after its marker, and `deleteFootnote(id)` delete both. A double click on a marker goes to its entry, and a double click on an entry's number to its marker. The part the reader arrives at carries `data-de-revealed` (`entry` or `marker`) until the writer moves the selection or edits.

Implementation: `src/engine/footnotes.ts`
Verification: `src/engine/footnotes.test.ts`

### DOCE-FOOTNOTES-1.5 - Typing beside a marker

A marker is not text: with the caret just after a marker, or before one that starts its block, typing shall take the marks of the text before the marker, or at the start of a block of the text after it, as if the marker were not there. A mark that ends at its text, such as a link, carries on only when the text on both sides has it. Marks the writer chose for the caret are kept.

Implementation: `src/engine/footnote-marks.ts`, `src/engine/footnotes.ts`
Verification: `src/engine/footnote-marks.test.ts`

### DOCE-FOOTNOTES-1.6 - Pasting where footnotes have rules

`flattenFootnotePaste(slice, state)`, which the paste pipeline runs, shall repair pasted content by the footnote places (D13): pasted into a footnote entry, it becomes one run of text, its blocks joined by a space, keeping the inline content and marks an entry allows and no markers; pasted elsewhere, markers are kept only in paragraphs that may cite a footnote (DOCE-FOOTNOTES-1.2). Content that joins the block at the caret, inline content and the text block an open slice starts with, keeps its markers only where the caret may cite one; the slice's whole blocks land beside that block and keep theirs where a paragraph there may cite one, so paragraphs pasted or moved with the caret in a heading keep their footnotes. It returns the slice unchanged when nothing needs repair.

Implementation: `src/engine/footnote-paste.ts`
Verification: `src/engine/footnote-paste.test.ts`

## DOCE-FOOTNOTES-2 - Numbering in a layout without pages

### DOCE-FOOTNOTES-2.1 - Numbers in each section

`numberFootnotes(tr, { restartEach: 'section' })` shall number the footnotes from 1 in each section, in marker order, reading the sections through the document structure (`documentSections`), never pages. `createSectionFootnoteNumbers({ enabled })` shall number them so after each change that is not only typing, and after a transaction with `sectionFootnoteNumbersKey` meta, out of the undo history, while `enabled` says so. `DocumentEditor` shall enable it in the web layout of a template that numbers footnotes on each page, where each section is one page and no pagination numbers them, and number them again when it enters the web layout or the template changes; on pages the pagination numbers them on each page.

Implementation: `src/engine/footnote-model.ts`, `src/engine/section-footnote-numbers.ts`, `src/components/document-editor/use-document-layout.ts`
Verification: `src/engine/footnotes.test.ts`, `src/components/document-editor/document-editor.test.tsx`

## Hooks

| Hook               | Kind      | Values            | Description                                                                  |
| ------------------ | --------- | ----------------- | ---------------------------------------------------------------------------- |
| `data-de-revealed` | attribute | `entry`, `marker` | On the footnote entry or marker the reader was taken to, until they move on. |
