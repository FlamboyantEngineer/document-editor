# Footnotes

Inserting footnotes, keeping their entries with their markers, numbering them, and moving between a marker and its entry. The pages place each entry on the page that cites it (DOCE-PAGINATION-7.2).

## DOCE-FOOTNOTES-1 - Footnotes in the text

### DOCE-FOOTNOTES-1.1 - Inserting a footnote

`insertFootnote()` shall insert a footnote at the caret: its marker in the text, in place of the selection, and an empty entry in the footnote area of the page, both numbered in document order, with the caret in the entry.

Implementation: `src/engine/footnotes.ts`
Verification: `src/engine/footnotes.test.ts`

### DOCE-FOOTNOTES-1.2 - Where a footnote may be cited

A footnote may be cited in a paragraph of the page's body, in a list, a table cell, a quote or a layout column too (`canInsertFootnote`); elsewhere, in a heading, a code block, a footnote entry or a page header or footer, inserting one is refused.

Implementation: `src/engine/footnotes.ts`
Verification: `src/engine/footnotes.test.ts`

### DOCE-FOOTNOTES-1.3 - Entries follow their markers

After each of the writer's changes, `createFootnotes()`, which the editing plugins install, shall delete each entry whose marker is gone and, unless the template numbers footnotes on each page, number the markers and entries in document order, so the web layout numbers them too.

Implementation: `src/engine/footnotes.ts`, `src/engine/document-editing.ts`
Verification: `src/engine/footnotes.test.ts`

### DOCE-FOOTNOTES-1.4 - Finding, editing and deleting

`listFootnotes(doc)` shall give each footnote's marker and entry positions by id, `footnoteAt(state)` the footnote whose marker is selected or whose entry holds the selection, `editFootnote(id)` put the caret at the end of its entry, `goToFootnoteMarker(id)` select its marker, and `deleteFootnote(id)` delete both. A double click on a marker goes to its entry.

Implementation: `src/engine/footnotes.ts`
Verification: `src/engine/footnotes.test.ts`
