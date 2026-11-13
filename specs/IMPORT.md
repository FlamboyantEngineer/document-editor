# Import

Bringing content in from elsewhere without the editor: documents of other formats read into stored documents (DOCE-FORMAT-1.1), content composed into a template's sections, a new document of a template, and part of a stored document taken out. Everything here runs on stored files, so a server imports `@flamboyantengineer/document-editor/import` beside `./model` with no DOM.

## DOCE-IMPORT-1 - Contract

### DOCE-IMPORT-1.1 - The import entry

`@flamboyantengineer/document-editor/import` shall export `composeDocumentFile`, `createDocumentFile` and `selectStoredContent`, with their types, and shall import in Node with no `document` or `window` global and define neither.

Implementation: `src/import/index.ts`, `package.json`
Verification: `src/import/import-entry.test.ts`

## DOCE-IMPORT-3 - Composing documents

### DOCE-IMPORT-3.1 - New document from a template

`createDocumentFile({ template, revision, newId, author })` shall give a stored document pinned to the template at `revision` (DOCE-TEMPLATES-11.1), with the template's required sections in order, each holding a copy of its template section's `content`: a locked section (`editable: false`) shall be stored locked with the template's content exactly, without element ids, and the elements of every other section shall get fresh ids from `newId`, attributed to `author` (`assignStoredIds`). A template without sections shall give one empty section with no name.

Implementation: `src/model/templates/template-sections.ts`
Verification: `src/model/templates/template-sections.test.ts`

### DOCE-IMPORT-3.2 - Composing into template sections

`composeDocumentFile(content, { template, section, revision, newId, author })` shall make a document of the template, as `createDocumentFile` does, from content brought in from elsewhere, a stored document or plain stored content. A section of the content whose `name` is one of the template's editable sections shall fill that section, adding it in template order when it is not required; the rest of the content, in order, shall fill the editable section named `section`, or the template's first editable one, replacing its starting content. A section the template locks shall keep the template's content. The content's own section settings, such as its header and footer, shall be left out, since the template's apply. Each element of an editable section without a valid, unique id shall get one. Naming a `section` the template has no editable section for shall throw.

Implementation: `src/model/templates/template-sections.ts`
Verification: `src/model/templates/template-sections.test.ts`

### DOCE-IMPORT-3.3 - Fitted table widths

When it composes a document, each table, at any depth, whose column widths are all set and add up to more than its section's pages' content width (the section's page size, orientation and margins over the template's) shall have every column shrunk in proportion to fit it (`fitStoredTables`, `scaleColumns`), whole pixels, never below the narrowest a column may be (`DEFAULT_TABLE_CELL_MIN_WIDTH`), a column already narrower keeping its width; each cell shall take the widths of the columns it spans. A table that fits, or one with a width unset, shall be left as it is.

Implementation: `src/model/layout/column-widths.ts`, `src/model/layout/stored-table-widths.ts`, `src/model/templates/template-sections.ts`
Verification: `src/model/layout/column-widths.test.ts`, `src/model/layout/stored-table-widths.test.ts`, `src/model/templates/template-sections.test.ts`

### DOCE-IMPORT-3.4 - Part of a stored document

`selectStoredContent(file, target)` shall give a copy of part of a stored document: with `{ section }`, the content of the first section whose `id` or `name` it is; with `{ heading }`, the heading with that element id, in any section, and the blocks after it up to the next heading at its level or above (a heading without a level is at level 1). It shall give null when there is no such section or heading.

Implementation: `src/import/select-content.ts`
Verification: `src/import/select-content.test.ts`
