# Import

Bringing content in from elsewhere without the editor: documents of other formats read into stored documents (DOCE-FORMAT-1.1), content composed into a template's sections, a new document of a template, and part of a stored document taken out. Everything here runs on stored files, so a server imports `@flamboyantengineer/document-editor/import` beside `./model` with no DOM.

## DOCE-IMPORT-1 - Contract

### DOCE-IMPORT-1.1 - The import entry

`@flamboyantengineer/document-editor/import` shall export the readers (`readDocx`, `readMarkdown`), `composeDocumentFile`, `createDocumentFile`, `selectStoredContent` and `createImportWarnings`, with their types, and shall import in Node with no `document` or `window` global and define neither.

Implementation: `src/import/index.ts`, `package.json`
Verification: `src/import/import-entry.test.ts`

### DOCE-IMPORT-1.2 - Warnings

A reader shall give the stored document it read beside its warnings: what it left out or kept in another form, each an `ImportWarning` of `{ code, detail, count }`, one per kind (`ImportWarningCode`) and detail, such as a style's or a tag's name, counting how often it happened, in the order each first happened (`createImportWarnings`). A document read by a reader has no template or element ids; `composeDocumentFile` gives it both (DOCE-IMPORT-3.2).

Implementation: `src/import/import-warnings.ts`
Verification: `src/import/import-warnings.test.ts`

## DOCE-IMPORT-2 - Word processing documents

The reader takes styles and numbering by the mapping the library's Word writer uses (DOCE-FORMAT-5), shared with it in `test/fixtures/docx/`, and by Word's built-in style names, so a document from either reads the same way.

### DOCE-IMPORT-2.1 - Reading the file

`readDocx(bytes, { template, imageSource, limits })` shall read a word processing document (`.docx`) with no DOM and no third-party converter: it shall inflate its zip archive with the platform's `DecompressionStream`, parse its XML parts with the library's own reader, and give `{ ok: true, file, warnings, comments, images, pages }`. Bytes that are not a zip archive, an archive without a main document part, a damaged archive, compressed data or XML part, and an archive listing more files than `limits` allow, holding a file larger than they allow, or whose files read inflate to more bytes together than they allow, each part counted once since it is read once (`DEFAULT_ZIP_LIMITS`: 5000 files, 64 MB a file, 256 MB in all) shall give `{ ok: false, failure, message }`, with `failure` `unreadable`, `damaged` or `too-large`, and never throw.

Implementation: `src/import/docx/read-docx.ts`, `src/import/zip-read.ts`, `src/import/xml-read.ts`, `src/import/import-error.ts`, `src/import/docx/docx-package.ts`
Verification: `src/import/docx/read-docx.test.ts`

### DOCE-IMPORT-2.2 - Paragraphs and text

A paragraph shall be read by its style: `Heading1` to `Heading6`, or a style named `heading 1` to `heading 6`, or one setting an outline level from 0 to 5, as a heading at that level plus one; `Title` as the title heading; `ParagraphLevel2` to `ParagraphLevel6` as a paragraph at that level; `Custom_<key>` as a paragraph, or a heading at the paragraph's own outline level when it is 0 to 5 (9, Word's body text, or another value gives no heading), in custom style `<key>`, kept when no `template` is given or the template's `styles.custom` has the key, else left out with a `style-left-out` warning; consecutive `Quote` paragraphs as one quote; a `Code` paragraph as a code block, its line breaks as new lines; an empty paragraph whose only border is the bottom one as a rule; an empty paragraph whose only content is its section's properties, which the writer adds for an empty section or one ending in a table, as nothing; and any other style as a plain paragraph with a `style-left-out` warning naming it. Runs shall give bold, italic, underline, strikethrough, superscript, subscript and, in a monospace font, code; a colour, highlight or other font shall be left out with a `formatting-left-out` warning. A link to an outside target, or a `HYPERLINK` field (written with field characters or as a simple field) to an address or, with `\l`, a bookmark, shall be a link mark; a link to an address the editor does not hold (`safeHref`, such as `javascript:`) its text alone, with a `content-left-out` warning `unsafe link`; a symbol (`w:sym`) its character, or nothing for a code no character has; a line break a line break; a page break a page break between the paragraph's parts; a `PAGE` or `NUMPAGES` field the `page.current` or `page.total` variable; a run content control tagged `variable:<key>` that variable; another field its result as text with a `field-as-text` warning; an equation math holding its text, with an `equation-as-text` warning, a block of its own when it is the paragraph's display equation.

Implementation: `src/import/docx/docx-styles.ts`, `src/import/docx/docx-paragraph.ts`, `src/import/docx/docx-inline.ts`, `src/import/docx/docx-blocks.ts`, `src/import/stored-inline.ts`
Verification: `src/import/docx/read-docx.test.ts`

### DOCE-IMPORT-2.3 - Lists and numbering

A paragraph numbered by its own properties or its style shall be a list item: bulleted when its level's format is a bullet or none, numbered otherwise, nested by its level, a numbered list starting at its level's start or start override, or at 1 when that is not a whole number. Consecutive items of one numbering instance (`numId`) shall make one list, a change of kind or of numbering instance at a depth starting a new list there. A paragraph in Word's list paragraph style without numbering, right after a list item, shall be another paragraph of that item. Numbering from an abstract numbering named `Paragraphs` shall give the paragraph its level (`ilvl` + 1) instead; numbering from one named `Headings` shall be ignored, since the template numbers headings. A bulleted item whose text starts with a box, `☐`, `☑` or `☒`, and a space shall be a checklist item, clear for `☐` and ticked otherwise, without the box.

Implementation: `src/import/docx/docx-numbering.ts`, `src/import/docx/docx-blocks.ts`
Verification: `src/import/docx/read-docx.test.ts`

### DOCE-IMPORT-2.4 - Tables

A table shall be read with its grid's column widths in pixels as each cell's `colwidth`, a cell spanning grid columns as its `colspan`, at most the columns the grid has left and at most 1000, cells merged down as the first cell's `rowspan`, at most 1000, a row with no cell of its own (every cell merged down from above) left out, the cells above spanning one row less, header rows (`tblHeader`) as header cells, a cell's bottom or top vertical alignment and its shading colour, and the blocks in each cell, tables included. A `Caption` paragraph right before or after a table, figure or code block shall be its caption, without the writer's `CaptionLabel` runs.

Implementation: `src/import/docx/docx-tables.ts`, `src/import/docx/docx-blocks.ts`
Verification: `src/import/docx/read-docx.test.ts`

### DOCE-IMPORT-2.5 - Sections, headers and footers

Each section of the document shall be a stored section: its default header and footer, or the previous section's when it sets none, as its `header` and `footer` content, and its template section name from the writer's `sections` document variable when the document has one. `pages` shall give each section's page, in order: its named page size when one fits within a few pixels, its orientation, and its width, height and margins in points.

Implementation: `src/import/docx/docx-sections.ts`, `src/import/docx/read-docx.ts`
Verification: `src/import/docx/read-docx.test.ts`

### DOCE-IMPORT-2.6 - Footnotes

A footnote or endnote reference shall be a footnote where it is cited, holding its note's text, its paragraphs joined by line breaks.

Implementation: `src/import/docx/read-docx.ts`, `src/import/docx/docx-inline.ts`
Verification: `src/import/docx/read-docx.test.ts`

### DOCE-IMPORT-2.7 - Comments and tracked changes

The text in a comment's range, across paragraphs, shall take a comment mark naming its thread, `comment-<id>` after the thread's opening comment's entry id, which is fresh (`newId`), so that the threads of two documents read never share an id, with `state: 'resolved'` when that comment is done. `comments` shall give the threads (`CommentThread`): each opening comment with its replies, linked through the extended comments part, oldest first, each entry with its id, author name, text and date, and the text its marks cover as the thread's `quote`. A tracked insertion or deletion, and text moved there or moved away, shall be an insertion or deletion mark: a suggestion of its own, its `id` fresh (`newId`, eight random hexadecimal digits by default) and shared by the parts of one change, its `author` the change's author, so that the editor lists it and accepts or rejects it as its own suggestions.

Implementation: `src/import/docx/docx-comments.ts`, `src/import/docx/docx-inline.ts`
Verification: `src/import/docx/read-docx.test.ts`

### DOCE-IMPORT-2.8 - Images and what is left out

An embedded PNG, JPEG, GIF, BMP, WebP or SVG picture shall be an image with its alternative text and size in pixels, or a figure when it is alone in its paragraph, its `src` the one `imageSource` gives, or a `data:` URL; `images` shall give each embedded picture's path, media type and bytes once. A picture in another format or a linked one shall be left out with an `image-left-out` warning; a chart, diagram, shape, text box, embedded object or embedded document with a `content-left-out` warning.

Implementation: `src/import/docx/docx-drawing.ts`, `src/import/docx/docx-package.ts`, `src/import/docx/docx-inline.ts`
Verification: `src/import/docx/read-docx.test.ts`

### DOCE-IMPORT-2.9 - Documents the editor reads

Every document the reader gives shall read with `readDocumentFile` under the default policy, and compose into a template with `composeDocumentFile`.

Implementation: `src/import/docx/read-docx.ts`
Verification: `src/import/docx/read-docx.test.ts`

## DOCE-IMPORT-3 - Composing documents

### DOCE-IMPORT-3.1 - New document from a template

`createDocumentFile({ template, revision, newId, author })` shall give a stored document pinned to the template at `revision` (DOCE-TEMPLATES-11.1), with the template's required sections in order, each holding a copy of its template section's `content`: a locked section (`editable: false`) shall be stored locked with the template's content exactly, without element ids, and the elements of every other section shall get fresh ids from `newId`, attributed to `author` (`assignStoredIds`). A template without sections shall give one empty section with no name.

Implementation: `src/model/templates/template-sections.ts`
Verification: `src/model/templates/template-sections.test.ts`

### DOCE-IMPORT-3.2 - Composing into template sections

`composeDocumentFile(content, { template, section, revision, newId, author })` shall make a document of the template, as `createDocumentFile` does, from content brought in from elsewhere, a stored document or plain stored content. A section of the content whose `name` is one of the template's editable sections shall fill that section, adding it in template order when it is not required; the rest of the content, in order, shall fill the editable section named `section`, or else the first editable section the document has, among the template's required sections and those the content names, replacing its starting content; when the document has none, the template's first editable section shall be added, in template order, to take it. A section the template locks shall keep the template's content. The content's own section settings, such as its header and footer, shall be left out, since the template's apply. Each element of an editable section without a valid, unique id shall get one. Naming a `section` the template has no editable section for shall throw.

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

## DOCE-IMPORT-4 - Markdown

### DOCE-IMPORT-4.1 - Reading Markdown

`readMarkdown(markdown)` shall give `{ file, warnings }`: a stored document of one section read from CommonMark with GitHub's tables, strikethrough and footnotes. It shall read ATX and setext headings, paragraphs, quotes, bulleted and numbered lists, nested and with their start number, items of several blocks, task list items (`- [ ] `, `- [x] `) as checklist items, fenced code with its language, indented code, `$$` display math, rules, and tables with their header row and column alignment; inline, it shall read strong, emphasis, strikethrough and code, the HTML tags for underline, superscript, subscript, strikethrough, emphasis, strong, code and line breaks, inline links with their title, reference links, autolinks, images, `$` inline math, `{{key}}` variables, escapes and hard line breaks, with marks in the schema's order and adjacent text with the same marks joined. A footnote reference shall become a footnote with its definition's text where it is cited. A paragraph holding only an image shall be a figure; an all-italic paragraph right before a table or right after a figure shall be its caption, as the writer places them. Front matter shall be left out.

Implementation: `src/model/format/markdown-read.ts`, `src/model/format/markdown-read-blocks.ts`, `src/model/format/markdown-read-inline.ts`, `src/model/format/markdown-read-fence.ts`
Verification: `src/model/format/markdown-read.test.ts`

### DOCE-IMPORT-4.2 - Markdown left out

An HTML block and an HTML tag the reader does not read shall be left out, the tag keeping its text, each with a `content-left-out` warning naming it.

Implementation: `src/model/format/markdown-read-inline.ts`, `src/model/format/markdown-read-blocks.ts`
Verification: `src/model/format/markdown-read.test.ts`

### DOCE-IMPORT-4.3 - Reading back the writer

Markdown that `writeMarkdown` (DOCE-FORMAT-4.1) wrote for a document of the regression set shall read into a document that `readDocumentFile` reads and that `writeMarkdown` writes as the same Markdown, apart from spaces at line ends, except where the writer itself drops content, which shall then write the same Markdown a second time.

Implementation: `src/model/format/markdown-read.ts`
Verification: `src/model/format/markdown-read.test.ts`

### DOCE-IMPORT-4.4 - Markdown edge cases

A code fence shall be closed only by a run of its own character at least as long, with nothing after it, and a line in fenced code shall never be read as a link or footnote definition; a run of backticks followed by text holding another backtick, such as a line starting with a code span, shall open no fence. Inline math shall be read as Pandoc reads it: no space just inside either dollar sign and no digit right after the closing one, so a price such as `$5-$10` stays text; a dollar sign a backslash escapes shall not close it and shall stay in its source. Blank lines in a list item, one or several, shall stay in it when the line after them is indented as far as its text. A link's address shall run to the parenthesis that closes the link, holding balanced parentheses and escaped ones, or be given in angle brackets, its escapes read. A tag named after an object property, such as `<constructor>`, shall be a tag the reader does not know (DOCE-IMPORT-4.2). Reading shall take work in proportion to the text: an unclosed delimiter or tag is looked for once, and the text is put in lower case at most once.

Implementation: `src/model/format/markdown-read.ts`, `src/model/format/markdown-read-fence.ts`, `src/model/format/markdown-read-inline.ts`, `src/model/format/markdown-read-blocks.ts`
Verification: `src/model/format/markdown-read-edges.test.ts`, `src/model/format/markdown-round-trip.test.ts`
