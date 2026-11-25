# Layout

A document is shown on pages or in the web layout. In the web layout each section is one page that fills its surface and grows with its content, inset only by its template's margins, as an article shows. A document may arrange its content in layout sections: top-level `layout_section` nodes holding one `layout_column` per column of a preset (DOCE-SCHEMA layout presets). A section stores only its preset, so its columns take the preset's widths, and a preset the library does not know shows equal columns.

## DOCE-LAYOUT-1 - Keeping content in layout sections

### DOCE-LAYOUT-1.1 - Wrapping loose blocks

`wrapInLayoutSections(tr)` shall wrap each run of top-level blocks outside a layout section, in each editable section's page content (or the document when it has no sections), in a one-column (`single`) section, and say whether it changed the document. It shall only add the section and column around the run, so the blocks keep their identity. `needsLayoutSections(doc)` shall say whether a document needs it.

Implementation: `src/model/layout/layout-sections.ts`
Verification: `src/model/layout/layout-sections.test.ts`

### DOCE-LAYOUT-1.2 - Content without a section

Content with no layout section shall get an empty one-column section, so a new document has one to type in.

Implementation: `src/model/layout/layout-sections.ts`
Verification: `src/model/layout/layout-sections.test.ts`

### DOCE-LAYOUT-1.3 - Unwrapping

`unwrapLayoutSections(fragment)` shall replace every layout section in a fragment, at any depth, with its columns' content in order, and return a fragment without sections unchanged.

Implementation: `src/model/layout/layout-sections.ts`
Verification: `src/model/layout/layout-sections.test.ts`

## DOCE-LAYOUT-2 - Arranging layout sections

### DOCE-LAYOUT-2.1 - Inserting a section

Outside a layout section, `setLayoutPreset(preset)` shall insert an empty section of the preset below the top-level block holding the selection, or in place of it when it is an empty paragraph, with the caret in its first column. A preset the library does not know shall be refused. `findLayoutSection(state)` and `activeLayoutPreset(state)` shall give the section holding the selection and its preset.

Implementation: `src/engine/layout-sections.ts`
Verification: `src/engine/layout-sections.test.ts`

### DOCE-LAYOUT-2.2 - Changing a preset

Inside a layout section, `setLayoutPreset(preset)` shall change its preset. Added columns shall start with an empty paragraph. The columns a preset with fewer columns no longer holds shall move, with their content, into new sections of the preset right below, filling their columns in order; empty ones shall be dropped. A selection in a moved column shall move with it.

Implementation: `src/engine/layout-sections.ts`
Verification: `src/engine/layout-sections.test.ts`

### DOCE-LAYOUT-2.3 - Adding and moving sections

`insertLayoutSectionBelow` shall insert an empty section of the same preset below the one holding the selection, with the caret in its first column. `moveLayoutSection(direction)` shall move the section past the block above (-1) or below (1) by moving that block, so the section and the selection in it keep their place in the steps; at the end of the content it shall refuse.

Implementation: `src/engine/layout-sections.ts`
Verification: `src/engine/layout-sections.test.ts`

### DOCE-LAYOUT-2.4 - Removing a section

`removeLayoutSection` shall delete the section holding the selection with its content. When it was the only block, an empty one-column section shall take its place.

Implementation: `src/engine/layout-sections.ts`
Verification: `src/engine/layout-sections.test.ts`

### DOCE-LAYOUT-2.5 - Keeping sections

`createLayoutSections({ keepWrapped: true, isRemote })` shall, after a local change leaves a block outside a layout section or removes the last one, wrap it or add an empty section (DOCE-LAYOUT-1.1, 1.2). Content that was already unwrapped before the change, and changes `isRemote` marks as coming from elsewhere, shall be left as they are.

Implementation: `src/engine/layout-sections.ts`
Verification: `src/engine/layout-sections.test.ts`

### DOCE-LAYOUT-2.6 - Pasting where sections are not kept

Without `keepWrapped`, a pasted layout section shall land as its columns' content.

Implementation: `src/engine/layout-sections.ts`
Verification: `src/engine/layout-sections.test.ts`

## DOCE-LAYOUT-3 - Reading time

### DOCE-LAYOUT-3.1 - Words and minutes

`countTextWords(text)` shall count a text's words, its runs of characters other than spaces. `countWords(doc)` shall count the words of a document's text, its footnotes included and its page headers and footers not. `readingMinutes(words, wordsPerMinute)` shall give the whole minutes they take to read at 200 words a minute unless told otherwise, rounded up and at least one.

Implementation: `src/model/document-words.ts`
Verification: `src/model/layout/layout-sections.test.ts`

## DOCE-LAYOUT-4 - Web layout

### DOCE-LAYOUT-4.1 - Filling the surface

A surface marked `data-layout="web"` shall show each section as one page that fills the surface's width and grows with its content, inset only by the template's page margins, on the page background (`--doc-page-background`), without the pages' headers and footers; a title shown above the content (`de-document-title`) shall line up with it. Each margin shall take the value for its side, with an unset side taking zero independently of the other sides. Layout sections shall show their columns side by side at their preset's widths.

Implementation: `labs/reference/document.css`, `labs/src/web-layout.lab.ts`
Verification: `e2e/web-layout.spec.ts`, `e2e/document-editor.spec.ts`

### DOCE-LAYOUT-4.2 - Reading and authoring

While a surface is marked `data-mode="authoring"`, each layout column shall show its box; otherwise the box shall be transparent, so switching modes moves nothing. An editor switched between reading and authoring by its `editable` prop shall keep its document and selection.

Implementation: `labs/reference/document.css`, `labs/src/web-layout.lab.ts`
Verification: `e2e/web-layout.spec.ts`

### DOCE-LAYOUT-4.3 - Layout controls

Controls running the layout commands (DOCE-LAYOUT-2) shall arrange the section holding the caret, and a host shall enable them only while authoring and when the command applies.

Implementation: `labs/src/web-layout.lab.ts`, `src/engine/layout-sections.ts`
Verification: `e2e/web-layout.spec.ts`

### DOCE-LAYOUT-4.4 - A document at its page width

`DocumentEditor` shall mark its root with how wide the web layout shows each section (`webWidth`, `data-web-width`): `fill` (the default), filling the surface as an article does, `page`, as a document, or `sheet`, as an endless page (DOCE-LAYOUT-4.5). A web-layout surface marked `page` shall show each section at its page width, centred and never wider than the surface, with no page margins, like a large text area.

Implementation: `src/components/document-editor/root-data.ts`, `labs/reference/document.css`
Verification: `src/components/document-editor/document-editor.test.tsx`, `e2e/document-editor.spec.ts`

### DOCE-LAYOUT-4.5 - An endless page

`webWidth` `sheet` shall show each section as an endless page: at most its page width, centred, shrinking with a narrower surface, inset by its template's page margins, and drawn as paper on the surface around it, as the pages are, growing with its content without ever ending. A host's `webMaxWidth`, a CSS length published on the root as `--de-web-max-width`, shall take the place of the page width as the widest the endless page shows, for every section. Otherwise a section whose scope sets no page size shall fill the surface, inset by its margins, as with `fill`.

Implementation: `src/components/document-editor/document-editor.tsx`, `src/components/document-editor/root-data.ts`, `labs/reference/document.css`, `labs/src/document-editor.lab.tsx`
Verification: `src/components/document-editor/document-editor.test.tsx`, `e2e/document-editor.spec.ts`
