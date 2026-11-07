# Contents

A list of contents (`toc_block`, stored as `contents`) lists a document's headings, or one kind of its captioned objects, with the number each shows and the page it is on. The list is drawn by the editor from the document as it is now, never stored, and a list longer than the room left on a page continues on the next page.

## DOCE-CONTENTS-1 - The catalog

### DOCE-CONTENTS-1.1 - Headings

`catalogDocument(doc, template)` shall list every heading in document order with its level, its text, its position, the page it is on and the number it shows, as its template scope's heading numbering prints it (DOCE-NUMBERING-5.1). A section whose template section restarts numbering shall start its headings' counters again.

Implementation: `src/model/contents/document-catalog.ts`, `src/model/templates/template-numbering.ts`
Verification: `src/model/contents/document-catalog.test.ts`

### DOCE-CONTENTS-1.2 - Captioned objects

The catalog shall list figures, captioned tables, code blocks and display equations, each kind on its own, with the number its caption shows (DOCE-NUMBERING-5.2). A kind's count shall restart at each heading of the level its numbering restarts at, and the parts a split object continues on shall not be listed again.

Implementation: `src/model/contents/document-catalog.ts`, `src/model/templates/template-numbering.ts`
Verification: `src/model/contents/document-catalog.test.ts`

## DOCE-CONTENTS-2 - Lists of contents

### DOCE-CONTENTS-2.1 - Listing entries

`createContents({ template, labels })` shall give a plugin and a `toc_block` node view that draws each list from the catalog: its title, then one entry per heading down to its depth (or per object of its kind) with the number, the text, a leader and the page, or its empty text when there is nothing to list. A table of contents shall list only the headings after it. The lists shall follow every change to the document.

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
| `data-contents-type`  | attribute | `toc`, `figures`, `tables`, `codeBlocks`, `equations` | What the list lists.                            |
| `data-level`          | state     |                                                       | An entry's heading level.                       |
| `data-de-measure-key` | state     |                                                       | What the list's rendering depends on.           |
