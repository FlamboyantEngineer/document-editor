# Contents

A list of contents (`toc_block`, stored as `contents`) lists one kind of a document's nodes or marks, such as its headings, one kind of its captioned objects, the documents it cites, its abbreviations, or any node or mark type a host configures, with the number each shows and the page it is on. The list is drawn by the editor from the document as it is now, never stored, and a list longer than the room left on a page continues on the next page.

## DOCE-CONTENTS-1 - The catalog

### DOCE-CONTENTS-1.1 - Headings

`catalogDocument(doc, template, kinds)` shall give each kind of list its entries. With the default kinds (`DEFAULT_CONTENTS_KINDS`), the `toc` kind shall list every heading in document order with its level, its text, its position, the page it is on and the number it shows, as its template scope's heading numbering prints it (DOCE-NUMBERING-5.1). A section whose template section restarts numbering shall start its headings' counters again. Only the document's structural headings are numbered and listed (`isStructuralHeading`), and the reference stylesheet counts the same ones (DOCE-NUMBERING-5.1): a heading in a list, a table cell or header, a quote, or a page header or footer, at any depth, is text set as a heading, and the document's title stands above the structure. The headings of a script's output count where the script block stands in the body, as do those of a layout column. The outline shows the same headings (DOCE-OUTLINE-1.1). An entry's text shall be the heading's text as it reads now, without the text a suggestion deletes.

Implementation: `src/model/contents/document-catalog.ts`, `src/model/contents/structural-heading.ts`, `src/model/templates/template-numbering.ts`
Verification: `src/model/contents/document-catalog.test.ts`, `src/model/contents/structural-heading.test.ts`, `src/engine/outline.test.ts`, `test/structural-headings.test.ts`

### DOCE-CONTENTS-1.2 - Captioned objects

The default `figures`, `tables`, `codeBlocks` and `equations` kinds shall list figures, captioned tables, code blocks and display equations, with the number its caption shows (DOCE-NUMBERING-5.2). A kind's count shall restart at each heading of the level its numbering restarts at, and an object the pages split shall be listed once. A figure's, a table's and a code block's entry shall show its number, then `-`, then its caption; a linked code block's caption is the one its source gives it (`deriveLinkedCodeBlockCaption`), and an equation's entry shall show its number alone.

Implementation: `src/model/contents/document-catalog.ts`, `src/model/templates/template-numbering.ts`
Verification: `src/model/contents/document-catalog.test.ts`

### DOCE-CONTENTS-1.3 - Configured kinds

A kind (`ContentsKind`) shall name the node types it lists, and the mark types (`marks`), each run of text carrying one being one entry at the run's start, and may choose which of them it lists (`include`), an entry's text (`text`, the node's caption or its text, or the run's text, by default), its level (`level`, a heading's level, or 0 for other nodes) a number for nodes the template does not number (`number`), and the text between an entry's number and its text (`separator`). An entry of a heading or a numbered object shall show the template's number. An entry of a node with an element id shall carry it (`target`). The parts a split node continues on shall not be listed again.

Implementation: `src/model/contents/document-catalog.ts`
Verification: `src/model/contents/document-catalog.test.ts`

### DOCE-CONTENTS-1.4 - Ordering and showing a kind's entries

A kind may order its entries (`sort`), such as by their text, in place of document order, and list only the first entry of each identity (`unique`), which a kind gives (`identity`) or is the entry's number and text; a list of the kind shall leave out its entries' page numbers (`showPage: false`) or their leaders (`leader: false`).

Implementation: `src/model/contents/document-catalog.ts`, `src/engine/contents.ts`
Verification: `src/model/contents/document-catalog.test.ts`, `e2e/contents.spec.ts`

### DOCE-CONTENTS-1.5 - References

The default `references` kind shall list each document the document cites with an external reference (a `reference` mark whose type is not `internal-…`), once, in the order it is first cited after the document's first table of contents (DOCE-CONTENTS-1.8), so a document cited before and after it is listed at its first citation after it: the cited document's number as the entry's number and its title, or the catalogue entry's label, as its text, as the citation recorded them. A list of references shall show neither page numbers nor leaders.

Implementation: `src/model/contents/document-catalog.ts`
Verification: `src/model/contents/document-catalog.test.ts`

### DOCE-CONTENTS-1.6 - Abbreviations

The default `abbreviations` kind shall list each abbreviation used anywhere in the document (`abbreviation_reference`), once for each glossary entry it names, in alphabetical order: the abbreviation as the entry's number and its expansion as its text, as the document last read them from the glossary. A list of abbreviations shall show neither page numbers nor leaders.

Implementation: `src/model/contents/document-catalog.ts`
Verification: `src/model/contents/document-catalog.test.ts`

### DOCE-CONTENTS-1.7 - Counters at a position

`numberingCountersAt(doc, template, pos)` shall give the counters in effect just before a position, as the catalog and the stylesheet count them: each heading level's count and each numbered object kind's, with the restarts of the sections and headings before it, so content shown elsewhere can number on from them.

Implementation: `src/model/contents/document-catalog.ts`
Verification: `src/model/contents/document-catalog.test.ts`

### DOCE-CONTENTS-1.8 - Front matter

A kind marked `after` shall list only what follows the document's first table of contents (a `toc_block` of the `toc` kind), as the default `toc`, `figures`, `tables`, `codeBlocks`, `equations` and `references` kinds are; what comes before it keeps its numbers and counters, and every list of the kind, wherever it stands and however the pages split it, lists the same entries. A document without a table of contents leaves nothing out. `ELEMENT_KINDS` list every heading and captioned object, front matter included, with its caption or text, for what numbers and names the document's elements apart from any list: the outline, reference targets, automation and a printed snapshot's numbers.

Implementation: `src/model/contents/document-catalog.ts`, `src/model/contents/contents-kinds.ts`
Verification: `src/model/contents/document-catalog.test.ts`

## DOCE-CONTENTS-2 - Lists of contents

### DOCE-CONTENTS-2.1 - Listing entries

`createContents({ template, kinds, labels })` shall give a plugin and a `toc_block` node view that draws each list from the catalog of the kind its `tocType` names: its title, then one entry per node of its kind down to its depth, with the number, the text, a leader and the page, or its empty text when there is nothing to list. The page shall be the one the layout shows the entry on (`pageMap`), and follow each layout. A kind marked `after` lists only what follows the document's first table of contents (DOCE-CONTENTS-1.8). The lists shall follow every change to the document.

Implementation: `src/engine/contents.ts`, `src/engine/contents-listing.ts`, `src/engine/contents-view.ts`, `labs/src/contents.lab.ts`
Verification: `e2e/contents.spec.ts`

### DOCE-CONTENTS-2.2 - Lists across pages

`splitContents(block, fitting)` shall split a list after the last entry row that fits, so the part on the next page continues with the next entry and shows no title. A list's element shall name what its rendering depends on beyond its node with `data-de-measure-key`, and a changed key shall measure it again.

Implementation: `src/model/pagination/contents-split.ts`, `src/pagination/measure-blocks.ts`, `src/engine/contents.ts`
Verification: `e2e/contents.spec.ts`

### DOCE-CONTENTS-2.3 - Renumbering

A change that adds, removes or moves a heading or an object shall renumber the entries and their pages in every list.

Implementation: `src/engine/contents.ts`, `src/engine/contents-view.ts`, `labs/src/contents.lab.ts`
Verification: `e2e/contents.spec.ts`

### DOCE-CONTENTS-2.4 - Going to an entry

Choosing an entry, with a click or with Enter or Space, shall put the caret at the start of the heading or object it names, scroll it into view and focus the editor. A list's entries shall be reachable with the keyboard: one of them is in the tab order, and the arrow keys, Home and End move the focus between them.

Implementation: `src/engine/contents.ts`
Verification: `e2e/contents.spec.ts`

### DOCE-CONTENTS-2.5 - Configured lists

The kinds a host gives `createContents` shall be listed alongside the default ones, or in place of a default kind of the same key, each with the labels the host gives it. A list whose `tocType` names no known kind shall list headings.

Implementation: `src/engine/contents.ts`, `src/engine/contents-view.ts`, `labs/src/contents.lab.ts`
Verification: `e2e/contents.spec.ts`

### DOCE-CONTENTS-2.6 - Anchors

A kind may give each entry's row an element id (`anchor`), so links to it resolve; the `abbreviations` kind gives each abbreviation's entry the id its link names (`abbreviationTargetId`). A click on an abbreviation in a read document, or a Ctrl or Cmd click in an edited one, shall scroll its entry in a list of abbreviations into view, and does nothing when no list shows it. When two lists show the same entry, only the first list's row shall carry its element id.

Implementation: `src/model/contents/document-catalog.ts`, `src/engine/contents.ts`, `src/engine/contents-listing.ts`
Verification: `src/engine/contents.test.ts`

### DOCE-CONTENTS-2.7 - Contents on each keystroke

The contents plugin shall catalog a document only once its catalog or its lists' rows are read, and a document that holds no list of contents (`toc_block`) shall draw no rows and catalog nothing for its decorations, so typing in a long document without a list does not count the whole document on each keystroke. Whether a document holds a list shall be found again only below the nodes an edit replaced.

Implementation: `src/engine/contents.ts`, `src/engine/contents-presence.ts`
Verification: `src/engine/contents.test.ts`

### DOCE-CONTENTS-2.8 - Wrapping and leaders

An entry shall sit on one line and wrap only when its text would run into its page number, its leader and page staying on its last line; an entry without a page wraps within the row. A leader shall fill the whole room between the entry's text and its page number, at any width and font size, ending against the page number and cut off on the text's side, its characters kept in their order and direction. The leader is drawn from its `data-leader` attribute, and copying rows (`copy` in the editor) shall give each row's number, text and page, one space apart and one row a line, without the leader. The list shall carry its kind's custom properties and each row its level's (DOCE-TEMPLATES-10.5).

Implementation: `src/engine/contents-view.ts`, `labs/reference/document.css`, `labs/src/contents.lab.ts`
Verification: `e2e/contents.spec.ts`, `src/engine/contents.test.ts`

### DOCE-CONTENTS-2.9 - Following a text edit

`deriveCatalog(catalog, change, kinds)` shall give the catalog after a change from the one before it, without counting the document, when every step of the change only replaces inline content inside one textblock: each entry keeps its number, level and page, moves by the edit, and an edited listed block's entry takes its new text. It shall give null, and the document is counted again, for any other change, or when the edited block lies in a listed block, holds a mark or an inline node a kind lists before or after the edit, or could change whether it is listed, its level or where a sorted or unique kind puts it. The contents plugin shall derive its catalog so through at most 16 changes in a row before counting again, and give how many times it counted a whole document (`ContentsState.builds`), so typing in a heading or a paragraph counts nothing.

Implementation: `src/model/contents/catalog-derive.ts`, `src/engine/contents-listing.ts`, `src/engine/contents.ts`
Verification: `src/model/contents/catalog-derive.test.ts`, `src/engine/contents.test.ts`

### DOCE-CONTENTS-2.10 - Printed links

A row whose entry names an element with an element id shall carry it (`data-target`), and a printed snapshot (DOCE-EDITOR-6.21) shall link the row's number, text and page to that element when the snapshot holds it.

Implementation: `src/engine/contents-view.ts`, `src/engine/print-links.ts`
Verification: `src/engine/print-links.test.ts`

## Hooks

| Hook                     | Kind      | Values                                                                               | Description                                          |
| ------------------------ | --------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| `de-contents`            | root      |                                                                                      | A list of contents.                                  |
| `de-contents__title`     | slot      |                                                                                      | The list's title, on its first part only.            |
| `de-contents__empty`     | slot      |                                                                                      | The text shown when there is nothing to list.        |
| `de-contents__entry`     | slot      |                                                                                      | One entry, a link to what it names.                  |
| `de-contents__number`    | slot      |                                                                                      | The number the entry's heading or object shows.      |
| `de-contents__separator` | slot      |                                                                                      | The text between an object's number and its caption. |
| `de-contents__text`      | slot      |                                                                                      | The entry's text.                                    |
| `de-contents__leader`    | slot      |                                                                                      | The leader between the text and the page.            |
| `data-leader`            | attribute |                                                                                      | The leader's characters, for the stylesheet.         |
| `de-contents__page`      | slot      |                                                                                      | The page the entry is on.                            |
| `data-contents-type`     | attribute | `toc`, `figures`, `tables`, `codeBlocks`, `equations`, `references`, `abbreviations` | The kind the list lists, or a configured kind.       |
| `data-target`            | attribute |                                                                                      | The element id of what the entry names.              |
| `data-level`             | state     |                                                                                      | An entry's heading level.                            |
| `data-de-measure-key`    | state     |                                                                                      | What the list's rendering depends on.                |
