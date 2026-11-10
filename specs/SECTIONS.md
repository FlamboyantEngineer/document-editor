# Sections

A document is a run of sections (`page_section`). A section may name one of its template's sections, whose settings apply over the template's in that section: its page size and margins, its styles and numbering, its header, footer and footnote settings (DOCE-TEMPLATES-5.4). A section starts on a new page, and within a section a page break (`page_break`) ends the page it is on (DOCE-PAGINATION-2). Sections are stored in the document (DOCE-FORMAT); a section's template values are view content and are never stored.

## DOCE-SECTIONS-1 - Section scopes

### DOCE-SECTIONS-1.1 - Section values

`createDocumentSections({ template })` shall give a plugin that sets, on each section naming a template section, that scope's template properties (the `--doc-*` values of DOCE-TEMPLATES-5) as its `style`, `data-numbering="restart"` where the section restarts numbering (DOCE-TEMPLATES-2.2), and `contenteditable="false"` where the template section is not editable. A section naming no template section, or one the template lacks, shall take the document's values. A transaction with `documentSectionsKey` meta shall set the values again after the template changes.

Implementation: `src/engine/document-sections.ts`
Verification: `src/engine/document-sections.test.ts`

### DOCE-SECTIONS-1.2 - Section headers and footers

After a change, the plugin shall set each page's header and footer to its section's template regions (`setPageRegions`), outside the history, and leave a document whose regions already match unchanged.

Implementation: `src/engine/document-sections.ts`
Verification: `src/engine/document-sections.test.ts`

## DOCE-SECTIONS-2 - Section commands

### DOCE-SECTIONS-2.1 - Starting a section

`insertDocumentSection(template, name)` shall start a section of a template section's name, or a plain section for `null`, after the top-level block the caret is in: the blocks after it shall move to the new section, which starts with its template section's content, or an empty paragraph, when there are none. The caret shall move to the new section's start.

Implementation: `src/engine/document-sections.ts`
Verification: `src/engine/document-sections.test.ts`

### DOCE-SECTIONS-2.2 - Sections a writer cannot add

`insertDocumentSection` shall refuse a name the template has no section of, and a template section that is not insertable.

Implementation: `src/engine/document-sections.ts`
Verification: `src/engine/document-sections.test.ts`

### DOCE-SECTIONS-2.3 - Joining sections

`joinDocumentSectionBackward(template)` shall join the section the caret is in into the one before, its blocks after that section's, keeping the earlier section's name and the caret where it was. It shall refuse in the first section and in a section its template section requires.

Implementation: `src/engine/document-sections.ts`
Verification: `src/engine/document-sections.test.ts`

### DOCE-SECTIONS-2.4 - Paged sections

Both commands shall work on a section laid out on several pages: its pages are joined first, so the blocks a section keeps or moves are whole, and the pagination lays the sections out again.

Implementation: `src/engine/document-sections.ts`
Verification: `src/engine/document-sections.test.ts`

## DOCE-SECTIONS-3 - Sections in the editor

### DOCE-SECTIONS-3.1 - Pages of a section's scope

The document editor shall install the sections plugin and lay each section out on pages of its own scope's size inside its own margins, with its own header, footer and numbering, and set its values again when the template changes.

Implementation: `src/components/document-editor/use-document-layout.ts`, `labs/reference/document.css`, `labs/src/sections.lab.tsx`
Verification: `e2e/sections.spec.ts`

### DOCE-SECTIONS-3.2 - Page breaks

A page break in a section shall end its page, and the content after it shall start the next page of the same section.

Implementation: `src/model/pagination/page-layout.ts`, `labs/src/sections.lab.tsx`
Verification: `e2e/sections.spec.ts`

### DOCE-SECTIONS-3.3 - Editing sections

Starting a section at the caret shall lay the moved blocks out on pages of the new section's scope with the caret in it, and joining it back shall lay them out on the earlier section's pages.

Implementation: `src/engine/document-sections.ts`, `labs/src/sections.lab.tsx`
Verification: `e2e/sections.spec.ts`

### DOCE-SECTIONS-3.4 - Centered pages

On pages, the reference stylesheet shall stack every page in one column, each centered in the editor, whatever its section's page size or orientation, with the same gap between pages as between sections.

Implementation: `labs/reference/document.css`, `labs/src/sections.lab.tsx`
Verification: `e2e/sections.spec.ts`

## DOCE-SECTIONS-4 - Keeping to the template

### DOCE-SECTIONS-4.1 - Drift

`templateSectionDrift(doc, template)` shall list how a document's sections drifted from its template: each required section it lacks (`missing`), each section of a name the template does not have (`unexpected`), and each section the writer cannot edit whose content is not the template's (`stale`), compared block by block by type and text.

Implementation: `src/engine/template-sync.ts`
Verification: `src/engine/template-sync.test.ts`

### DOCE-SECTIONS-4.2 - Bringing sections back in line

`syncTemplateSections(template)` shall give each stale section the template's content again, make each unexpected section a plain one, keeping its content, and add each missing required section after the sections the template places before it, with its starting content; it is refused when nothing drifted.

Implementation: `src/engine/template-sync.ts`, `src/engine/document-sections.ts`
Verification: `src/engine/template-sync.test.ts`

### DOCE-SECTIONS-4.3 - Sections the writer cannot edit

`lockedTemplateSections(template)` shall lock every position of a section the template, or the section itself, does not let the writer edit, for an edit lock (`createEditLock`); `anyLock(...locks)` holds where any lock given holds, so a host keeps its own locks beside it.

Implementation: `src/engine/template-sync.ts`
Verification: `src/engine/template-sync.test.ts`

## Hooks

| Hook             | Kind      | Values    | Description                                             |
| ---------------- | --------- | --------- | ------------------------------------------------------- |
| `data-numbering` | attribute | `restart` | On a section whose template section restarts numbering. |
