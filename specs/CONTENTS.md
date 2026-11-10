# Contents

A list of contents (`toc_block`, stored as `contents`) lists one kind of a document's nodes, such as its headings, one kind of its captioned objects, or any node type a host configures, with the number each shows and the page it is on. The list is drawn by the editor from the document as it is now, never stored, and a list longer than the room left on a page continues on the next page.

## DOCE-CONTENTS-1 - The catalog

### DOCE-CONTENTS-1.1 - Headings

`catalogDocument(doc, template, kinds)` shall give each kind of list its entries. With the default kinds (`DEFAULT_CONTENTS_KINDS`), the `toc` kind shall list every heading in document order with its level, its text, its position, the page it is on and the number it shows, as its template scope's heading numbering prints it (DOCE-NUMBERING-5.1). A section whose template section restarts numbering shall start its headings' counters again. A heading inside a list or a table is text set as a heading: it is neither numbered nor listed, and the reference stylesheet does not count it.

Implementation: `src/model/contents/document-catalog.ts`, `src/model/templates/template-numbering.ts`
Verification: `src/model/contents/document-catalog.test.ts`

### DOCE-CONTENTS-1.2 - Captioned objects

The default `figures`, `tables`, `codeBlocks` and `equations` kinds shall list figures, captioned tables, code blocks and display equations, with the number its caption shows (DOCE-NUMBERING-5.2). A kind's count shall restart at each heading of the level its numbering restarts at, and the parts a split object continues on shall not be listed again.

Implementation: `src/model/contents/document-catalog.ts`, `src/model/templates/template-numbering.ts`
Verification: `src/model/contents/document-catalog.test.ts`

### DOCE-CONTENTS-1.3 - Configured kinds

A kind (`ContentsKind`) shall name the node types it lists, and may choose which of them it lists (`include`), an entry's text (`text`, the node's caption or its text by default), its level (`level`, a heading's level, or 0 for other nodes) and a number for nodes the template does not number (`number`). An entry of a heading or a numbered object shall show the template's number. The parts a split node continues on shall not be listed again.

Implementation: `src/model/contents/document-catalog.ts`
Verification: `src/model/contents/document-catalog.test.ts`

### DOCE-CONTENTS-1.4 - Ordering and showing a kind's entries

A kind may order its entries (`sort`), such as by their text, in place of document order, and list only the first entry of each text (`unique`); a list of the kind shall leave out its entries' page numbers (`showPage: false`) or their leaders (`leader: false`).

Implementation: `src/model/contents/document-catalog.ts`, `src/engine/contents.ts`
Verification: `src/model/contents/document-catalog.test.ts`, `e2e/contents.spec.ts`

## DOCE-CONTENTS-2 - Lists of contents

### DOCE-CONTENTS-2.1 - Listing entries

`createContents({ template, kinds, labels })` shall give a plugin and a `toc_block` node view that draws each list from the catalog of the kind its `tocType` names: its title, then one entry per node of its kind down to its depth, with the number, the text, a leader and the page, or its empty text when there is nothing to list. A kind marked `after`, as the table of contents is, shall list only the nodes after the list. The lists shall follow every change to the document.

Implementation: `src/engine/contents.ts`, `labs/src/contents.lab.ts`
Verification: `e2e/contents.spec.ts`

### DOCE-CONTENTS-2.2 - Lists across pages

`splitContents(block, fitting)` shall split a list after the last entry row that fits, so the part on the next page continues with the next entry and shows no title. A list's element shall name what its rendering depends on beyond its node with `data-de-measure-key`, and a changed key shall measure it again.

Implementation: `src/model/pagination/contents-split.ts`, `src/pagination/measure-blocks.ts`, `src/engine/contents.ts`
Verification: `e2e/contents.spec.ts`

### DOCE-CONTENTS-2.3 - Renumbering

A change that adds, removes or moves a heading or an object shall renumber the entries and their pages in every list.

Implementation: `src/engine/contents.ts`, `labs/src/contents.lab.ts`
Verification: `e2e/contents.spec.ts`

### DOCE-CONTENTS-2.4 - Going to an entry

Choosing an entry shall put the caret at the start of the heading or object it names, scroll it into view and focus the editor.

Implementation: `src/engine/contents.ts`
Verification: `e2e/contents.spec.ts`

### DOCE-CONTENTS-2.5 - Configured lists

The kinds a host gives `createContents` shall be listed alongside the default ones, or in place of a default kind of the same key, each with the labels the host gives it. A list whose `tocType` names no known kind shall list headings.

Implementation: `src/engine/contents.ts`, `labs/src/contents.lab.ts`
Verification: `e2e/contents.spec.ts`

## Hooks

| Hook                  | Kind      | Values                                                | Description                                     |
| --------------------- | --------- | ----------------------------------------------------- | ----------------------------------------------- |
| `de-contents`         | root      |                                                       | A list of contents.                             |
| `de-contents__title`  | slot      |                                                       | The list's title, on its first part only.       |
| `de-contents__empty`  | slot      |                                                       | The text shown when there is nothing to list.   |
| `de-contents__entry`  | slot      |                                                       | One entry, a link to what it names.             |
| `de-contents__number` | slot      |                                                       | The number the entry's heading or object shows. |
| `de-contents__text`   | slot      |                                                       | The entry's text.                               |
| `de-contents__leader` | slot      |                                                       | The leader between the text and the page.       |
| `de-contents__page`   | slot      |                                                       | The page the entry is on.                       |
| `data-contents-type`  | attribute | `toc`, `figures`, `tables`, `codeBlocks`, `equations` | The kind the list lists, or a configured kind.  |
| `data-level`          | state     |                                                       | An entry's heading level.                       |
| `data-de-measure-key` | state     |                                                       | What the list's rendering depends on.           |
