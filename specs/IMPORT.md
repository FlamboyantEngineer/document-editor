# Import

Bringing content in from elsewhere without the editor: documents of other formats read into stored documents (DOCE-FORMAT-1.1), content composed into a template's sections, a new document of a template, and part of a stored document taken out. Everything here runs on stored files, so a server imports `@flamboyantengineer/document-editor/import` beside `./model` with no DOM.

## DOCE-IMPORT-1 - Contract

### DOCE-IMPORT-1.1 - The import entry

`@flamboyantengineer/document-editor/import` shall export the readers (`readDocx`, `readMarkdown`), `composeDocumentFile`, `createDocumentFile`, `selectStoredContent`, `createImportWarnings` and `importWarningGroup`, with their types, and shall import in Node with no `document` or `window` global and define neither.

Implementation: `src/import/index.ts`, `package.json`
Verification: `src/import/import-entry.test.ts`

### DOCE-IMPORT-1.2 - Warnings

A reader shall give the stored document it read beside its warnings: what it left out or kept in another form, each an `ImportWarning` of `{ code, detail, count, group }`, one per kind (`ImportWarningCode`) and detail, such as a style's or a tag's name, counting how often it happened, in the order each first happened (`createImportWarnings`), with its kind's report group (DOCE-IMPORT-1.3). A document read by a reader has no template or element ids; `composeDocumentFile` gives it both (DOCE-IMPORT-3.2).

Implementation: `src/import/import-warnings.ts`
Verification: `src/import/import-warnings.test.ts`

### DOCE-IMPORT-1.3 - The import report

Each warning kind shall belong to one report group (`importWarningGroup`): `applied`, presentation the template gives in place of the document's own (`caption-numbered`, `title-applied`, `heading-numbering-applied`, `table-style-applied`); `skipped`, the document's presentation the template deliberately replaces (`contents-skipped`, `header-footer-skipped`, `section-layout-skipped`, `formatting-left-out`); and `not-imported`, content left out or simplified, which every other kind, a host's own included, belongs to, so a loss is never shown as a deliberate skip. `readDocx` shall also give `counts`, how many headings (the title apart), tables, images (figures included) and footnotes the document holds, and `title`, the text of its title paragraph, or null, which a host may make the new document's name.

Implementation: `src/import/import-warnings.ts`, `src/import/docx/docx-resolve.ts`
Verification: `src/import/import-warnings.test.ts`, `src/import/docx/read-docx-structure.test.ts`

## DOCE-IMPORT-2 - Word processing documents

The reader takes styles and numbering by the mapping the library's Word writer uses (DOCE-FORMAT-5), shared with it in `test/fixtures/docx/`, and by Word's built-in style names, so a document from either reads the same way.

### DOCE-IMPORT-2.1 - Reading the file

`readDocx(bytes, { template, imageSource, limits })` shall read a word processing document (`.docx`) with no DOM and no third-party converter: it shall inflate its zip archive with the platform's `DecompressionStream`, parse its XML parts with the library's own reader, and give `{ ok: true, file, warnings, comments, images, pages }`. Bytes that are not a zip archive, an archive without a main document part, a damaged archive, compressed data or XML part, an archive listing more files than `limits` allow, holding a file larger than they allow, or whose files read inflate to more bytes together than they allow, each part counted once since it is read once (`DEFAULT_ZIP_LIMITS`: 10,000 files, 64 MiB a file, 100 MiB in all), an XML part larger or nesting deeper than they allow, and a document read whose JSON is larger than they allow (`DEFAULT_DOCX_LIMITS`: 10 MiB an XML part, 256 levels, 10 MiB read), and a package the reader refuses (DOCE-IMPORT-2.14) shall give `{ ok: false, failure, message }`, with `failure` `unreadable`, `damaged`, `too-large` or `refused`, and never throw. The same XML limits shall apply to content types and all relationship parts. A part shall have one XML root. The main document shall have a WordprocessingML document root with one body, and Office XML names shall be recognized by their namespace regardless of the declared prefixes. The time a reading may take is the host's to limit, since `readDocx` is a pure function a host runs where it chooses.

Implementation: `src/import/docx/read-docx.ts`, `src/import/zip-read.ts`, `src/import/xml-read.ts`, `src/import/import-error.ts`, `src/import/docx/docx-package.ts`, `src/import/docx/docx-checks.ts`
Verification: `src/import/docx/read-docx.test.ts`, `src/import/docx/read-docx-limits.test.ts`

### DOCE-IMPORT-2.2 - Paragraphs and text

A paragraph shall be read by its style: `Heading1` to `Heading9`, or a style named `heading 1` to `heading 9`, or one setting an outline level from 0 to 8, as a heading at that level plus one, a level past six read as six with a `heading-level-clamped` warning, and a heading numbered by the document's numbering with a `heading-numbering-applied` warning, since the template numbers headings; `Title` as the title heading, with a `title-applied` warning, but as a plain paragraph in a table cell, in a list or without text; `ParagraphLevel2` to `ParagraphLevel6` as a paragraph at that level; `Custom_<key>` as a paragraph, or a heading at the paragraph's own outline level when it is 0 to 8 (9, Word's body text, or another value gives no heading), in custom style `<key>`, kept when no `template` is given or the template's `styles.custom` has the key, else left out with a `style-left-out` warning; consecutive `Quote` paragraphs as one quote; a `Code` paragraph as a code block, its line breaks as new lines; an empty paragraph whose only border is the bottom one as a rule; an empty paragraph whose only content is its section's properties, which the writer adds for an empty section or one ending in a table, as nothing; and any other style as a plain paragraph with a `style-left-out` warning naming it. Runs shall give bold, italic, underline, strikethrough, superscript, subscript and, in a monospace font, code; a colour, highlight or other font shall be left out with a `formatting-left-out` warning. A link to an outside target, or a `HYPERLINK` field (written with field characters or as a simple field) to an address or, with `\l`, a bookmark, shall be a link mark; a link to an address the editor does not hold (`safeHref`, such as `javascript:`) its text alone, with a `content-left-out` warning `unsafe link`; a `REF` field a cross-reference (DOCE-IMPORT-2.11); a `SEQ` field's result a caption's number (DOCE-IMPORT-2.10); a symbol (`w:sym`) its character, or nothing for a code no character has; a line break a line break; a page break a page break between the paragraph's parts; a `PAGE` or `NUMPAGES` field the `page.current` or `page.total` variable; a run content control tagged `variable:<key>` that variable; another field its result as text with a `field-as-text` warning; an equation math holding its text, with an `equation-as-text` warning, a block of its own when it is the paragraph's display equation.

Implementation: `src/import/docx/docx-styles.ts`, `src/import/docx/docx-paragraph.ts`, `src/import/docx/docx-inline.ts`, `src/import/docx/docx-fields.ts`, `src/import/docx/docx-blocks.ts`, `src/import/stored-inline.ts`
Verification: `src/import/docx/read-docx.test.ts`, `src/import/docx/read-docx-structure.test.ts`

### DOCE-IMPORT-2.3 - Lists and numbering

A paragraph numbered by its own properties or its style shall be a list item: bulleted when its level's format is a bullet or none, numbered otherwise, nested by its level, a numbered list starting at its level's start or start override, or at 1 when that is not a whole number. Consecutive items of one numbering instance (`numId`) shall make one list, a change of kind or of numbering instance at a depth starting a new list there. A paragraph in Word's list paragraph style without numbering, right after a list item, shall be another paragraph of that item. Numbering from an abstract numbering named `Paragraphs` shall give the paragraph its level (`ilvl` + 1) instead; numbering from one named `Headings` shall be ignored, since the template numbers headings. A bulleted item whose text starts with a box, `☐`, `☑` or `☒`, and a space shall be a checklist item, clear for `☐` and ticked otherwise, without the box.

Implementation: `src/import/docx/docx-numbering.ts`, `src/import/docx/docx-blocks.ts`
Verification: `src/import/docx/read-docx.test.ts`

### DOCE-IMPORT-2.4 - Tables

A table shall be read with its grid's column widths in pixels as each cell's `colwidth`, a cell spanning grid columns as its `colspan`, at most the columns the grid has left and at most 1000, cells merged down as the first cell's `rowspan`, at most 1000, a row with no cell of its own (every cell merged down from above) left out, the cells above spanning one row less, header rows (`tblHeader`) as header cells, their text without bold since the template's table style sets their weight, a cell's bottom or top vertical alignment and its shading colour, and the blocks in each cell, tables included. Each table shall add a `table-style-applied` warning.

Implementation: `src/import/docx/docx-tables.ts`, `src/import/docx/docx-blocks.ts`
Verification: `src/import/docx/read-docx.test.ts`, `src/import/docx/read-docx-structure.test.ts`

### DOCE-IMPORT-2.5 - Sections, headers and footers

Each section of the document shall be a stored section: its default header and footer, or the previous section's when it sets none, as its `header` and `footer` content, and its template section name from the writer's `sections` document variable when the document has one. Each section's own header and footer shall add a `header-footer-skipped` warning naming it, and each section setting a page a `section-layout-skipped` warning, since a composed document takes the template's (DOCE-IMPORT-3.2). `pages` shall give each section's page, in order: its named page size when one fits within a few pixels, its orientation, and its width, height and margins in points.

Implementation: `src/import/docx/docx-sections.ts`, `src/import/docx/read-docx.ts`
Verification: `src/import/docx/read-docx.test.ts`, `src/import/docx/read-docx-structure.test.ts`

### DOCE-IMPORT-2.6 - Footnotes

A footnote or endnote reference shall be a footnote where it is cited, holding its note's text, its paragraphs joined by line breaks.

Implementation: `src/import/docx/read-docx.ts`, `src/import/docx/docx-inline.ts`
Verification: `src/import/docx/read-docx.test.ts`

### DOCE-IMPORT-2.7 - Comments and tracked changes

By default (`review: 'accept'`) the reader shall accept the review history: a tracked insertion or text moved there shall be plain text, a tracked deletion or text moved away left out, and comments left out, `comments` empty, each with a `review-left-out` warning (`tracked change`, `comment`). With `review: 'keep'`, the text in a comment's range, across paragraphs, shall take a comment mark naming its thread, `comment-<id>` after the thread's opening comment's entry id, which is fresh (`newId`), so that the threads of two documents read never share an id, with `state: 'resolved'` when that comment is done. `comments` shall give the threads (`CommentThread`): each opening comment with its replies, linked through the extended comments part, oldest first, each entry with its id, author name, text and date, and the text its marks cover as the thread's `quote`. A tracked insertion or deletion, and text moved there or moved away, shall be an insertion or deletion mark: a suggestion of its own, its `id` fresh (`newId`, eight random hexadecimal digits by default) and shared by the parts of one change, its `author` the change's author, so that the editor lists it and accepts or rejects it as its own suggestions.

Implementation: `src/import/docx/docx-comments.ts`, `src/import/docx/docx-inline.ts`
Verification: `src/import/docx/read-docx.test.ts`, `src/import/docx/read-docx-structure.test.ts`

### DOCE-IMPORT-2.8 - Images and what is left out

An embedded PNG, JPEG, GIF, BMP, WebP or SVG picture shall be an image with its alternative text and size in pixels, or a figure when it is alone in its paragraph, its `src` the one `imageSource` gives, or a `data:` URL; `images` shall give each embedded picture's path, media type and bytes once. A picture in another format or a linked one shall be left out with an `image-left-out` warning; a chart, diagram, shape, text box, embedded object or embedded document with a `content-left-out` warning naming it, a text box keeping its text, its paragraphs parted by line breaks, an embedded object its preview picture, and alternative content its fallback picture when its first choice shows none, else a placeholder `[<kind>]` where it was, such as `[chart]`. A floating picture shall be read where it is anchored, as an inline one.

Implementation: `src/import/docx/docx-drawing.ts`, `src/import/docx/docx-package.ts`, `src/import/docx/docx-inline.ts`, `src/utils/base64.ts`
Verification: `src/import/docx/read-docx.test.ts`, `src/import/docx/read-docx-structure.test.ts`, `src/utils/base64.test.ts`

### DOCE-IMPORT-2.9 - Documents the editor reads

Every document the reader gives shall read with `readDocumentFile` under the default policy, and compose into a template with `composeDocumentFile`.

Implementation: `src/import/docx/read-docx.ts`
Verification: `src/import/docx/read-docx.test.ts`

### DOCE-IMPORT-2.10 - Captions

A paragraph in Word's caption style, or one based on it, a paragraph holding a `SEQ` field and, unless `textCaptions` is false, a plain paragraph whose text starts with `Figure`, `Fig.` or `Table`, a number such as `2`, `2.1` or `A-1`, and a separator (`.`, `:` or a dash) followed by a space, shall be the caption of the figure, table or code block beside it: a table's caption looks for a table below it first, then above; a figure's and a code block's above first, then below; a caption whose label says nothing a figure or code block above it or a table or code block below it, then the other side; each past up to two empty paragraphs, which stay. A block that already has a caption keeps it. The caption shall lose its label and number, up to the `SEQ` field's result or the writer's caption label runs (`CaptionLabel`, `TableCaptionLabel`, `CodeCaptionLabel`), and the separator after them, keeping a figure's or a table's formats, links, footnotes and comments, since the template numbers captions, and its paragraph shall go, with a `caption-numbered` warning. A caption with nothing to caption shall stay a paragraph, its label and number kept, with a `caption-left-out` warning when the caption style or a `SEQ` field made it one; a plain paragraph that only looked like one stays as it was. Text such as `Table 2 shows` is no caption.

Implementation: `src/import/docx/docx-paragraph.ts`, `src/import/docx/docx-caption-content.ts`, `src/import/docx/docx-captions.ts`, `src/import/docx/docx-fields.ts`
Verification: `src/import/docx/read-docx-structure.test.ts`, `src/import/docx/read-docx.test.ts`

### DOCE-IMPORT-2.11 - Cross-references

A `REF` field naming a bookmark in a heading, a figure's, table's or code block's caption, the figure, table or code block itself or display math shall be a cross-reference to that block (`internal-heading`, `internal-figure`, `internal-table`, `internal-codeblock`, `internal-equation`), holding the field's result as its text, the block given an element id (`newId`) so the reference can name it. A `REF` field naming any other bookmark, or none, shall keep its result as text with a `field-as-text` warning.

Implementation: `src/import/docx/docx-fields.ts`, `src/import/docx/docx-resolve.ts`
Verification: `src/import/docx/read-docx-structure.test.ts`

### DOCE-IMPORT-2.12 - Typed heading numbers

A heading other than the title shall lose a number typed at its start, since the template numbers headings: a decimal or appendix hierarchy (`1.2.3`, `1.2.`, `A.1`, `B.2.3`), a number, Roman numeral or letter followed by `.` or `)` (`4.`, `IV.`, `B)`), or a bare number before a tab, each followed by white space, which goes with it, even when the number runs across runs of different formatting; the rest of its text and marks shall stay. A bare number before a space shall go only where every heading of its level under one parent heading starts with one, they count up from 1, and there are two of them or a subheading of the first continues its number, as in `1 Scope`, `1.1 Details`, `2 Conclusion`, so `2024 Results`, `100 Hour Inspection`, `3D models` or `F-16 Upgrades` stay as they are. Each removal shall add a `heading-number-removed` warning. Numbers in paragraphs and lists stay.

Implementation: `src/import/docx/docx-heading-numbers.ts`
Verification: `src/import/docx/read-docx-structure.test.ts`

### DOCE-IMPORT-2.13 - Tables of contents

A table of contents shall be left out, with a `contents-skipped` warning for each: the paragraphs of a `TOC` field, written with field characters across paragraphs or as a simple field, its nested fields and results included; a content control Word made as a table of contents; and paragraphs in a `toc 1` to `toc 9`, `TOC Heading` or `table of figures` style or one based on them. A paragraph or heading reading only `Contents` or `Table of contents` right before one, and paragraphs right before or after one telling the reader to update or replace it, shall go with it; other text about tables of contents stays.

Implementation: `src/import/docx/docx-fields.ts`, `src/import/docx/docx-styles.ts`, `src/import/docx/docx-captions.ts`
Verification: `src/import/docx/read-docx-structure.test.ts`

### DOCE-IMPORT-2.14 - Packages the reader refuses

The reader shall refuse (`refused`) a package with macros: a part named `vbaProject` or `vbaData`, a content type (`[Content_Types].xml` default or override) that is macro-enabled or VBA, or a relationship of a VBA type, whatever its file is called; a main document, styles, numbering, footnotes, endnotes or comments part that is not at its standard place (`word/document.xml`, `word/styles.xml` and so on); and an XML part declaring a document type, which could declare entities or name outside files. It shall never read a part outside the archive, an outside relationship target being only a link's address.

Implementation: `src/import/docx/docx-checks.ts`, `src/import/xml-read.ts`, `src/import/docx/docx-package.ts`
Verification: `src/import/docx/read-docx-limits.test.ts`, `src/import/xml-read.test.ts`

### DOCE-IMPORT-2.15 - Appendices

With `appendixSection`, the reader shall put the document's appendices in sections of that name: from the first heading in a style whose name, or a name of a style it is based on, holds `appendix` or `annex`, else from the first level-1 heading whose text starts with `Appendix` or `Annex` and a letter or number, to the end, the heading's text kept whole; the page breaks and empty paragraphs right before it shall be left out, and `pages` shall give the split section's page for both parts. Without it the appendices stay where they are.

Implementation: `src/import/docx/docx-appendix.ts`, `src/import/docx/docx-paragraph.ts`
Verification: `src/import/docx/read-docx-structure.test.ts`

## DOCE-IMPORT-3 - Composing documents

### DOCE-IMPORT-3.1 - New document from a template

`createDocumentFile({ template, revision, newId, author, schema, contentsTokens })` shall give a stored document pinned to the template at `revision` (DOCE-TEMPLATES-11.1), with the template's required sections in order, each holding a copy of its template section's `content`: a locked section (`editable: false`) shall be stored locked with the template's content, and every element, a locked section's too, shall get a fresh id from `newId`, attributed to `author` (`assignStoredIds`), so comments and links can hold on to the template's fixed content. With `schema`, the template's content shall be read as `readTemplateContent` reads it (DOCE-TEMPLATES-8.1), its `{{key}}` tokens live variables and its list tokens lists of contents, with `contentsTokens` in place of the default list tokens; without one it is copied as it is, but for each top-level paragraph that is only a list token, which becomes a list of contents of its kind (`storedContentsTokens`). A template without sections shall give one empty section with no name.

Implementation: `src/model/templates/template-sections.ts`
Verification: `src/model/templates/template-sections.test.ts`, `src/model/templates/template-compose.test.ts`

### DOCE-IMPORT-3.2 - Composing into template sections

`composeDocumentFile(content, { template, section, revision, newId, author })` shall make a document of the template, as `createDocumentFile` does, from content brought in from elsewhere, a stored document or plain stored content. A section of the content whose `name` is one of the template's editable sections shall fill that section, adding it in template order when it is not required; the rest of the content, in order, shall fill the editable section named `section`, or else the first editable section the document has, among the template's required sections and those the content names, replacing its starting content; when the document has none, the template's first editable section shall be added, in template order, to take it. A section the template locks shall keep the template's content. The content's own section settings, such as its header and footer, shall be left out, since the template's apply. Each element without a valid, unique id shall get one. Naming a `section` the template has no editable section for shall throw.

Implementation: `src/model/templates/template-sections.ts`
Verification: `src/model/templates/template-sections.test.ts`

### DOCE-IMPORT-3.3 - Fitted table widths

When it composes a document, each table, at any depth, whose column widths are all set and add up to more than its section's pages' content width (the section's page size, orientation and margins over the template's) shall have every column shrunk in proportion to fit it (`fitStoredTables`, `scaleColumns`), whole pixels, never below the narrowest a column may be (`DEFAULT_TABLE_CELL_MIN_WIDTH`), a column already narrower keeping its width; each cell shall take the widths of the columns it spans, counted from the column it starts in, past the columns cells spanning rows from above cover. A captioned table keeps its caption when it is fitted. When the section has no fixed content width, its imported column widths shall be preserved. A table that fits, or one with a width unset, shall be left as it is. With `tables: 'fill'`, each top-level table whose widths are all set shall instead fill that width exactly, its columns in proportion to their widths, whole pixels summing to it, the pixels rounding leaves going to the columns that lost most (`fillColumns`), narrower tables widening too; nested tables only shrink. `tableInset` pixels shall be kept clear of the width either way, such as for the page's and table's borders.

Implementation: `src/model/layout/column-widths.ts`, `src/model/layout/stored-table-widths.ts`, `src/model/templates/template-sections.ts`
Verification: `src/model/layout/column-widths.test.ts`, `src/model/layout/stored-table-widths.test.ts`, `src/model/templates/template-sections.test.ts`, `src/model/templates/template-compose.test.ts`

### DOCE-IMPORT-3.4 - Part of a stored document

`selectStoredContent(file, target)` shall give a copy of part of a stored document: with `{ section }`, the content of the first section whose `id` or `name` it is; with `{ heading }`, the heading with that element id, in any section, and the blocks after it up to the next heading at its level or above (a heading without a level is at level 1). It shall give null when there is no such section or heading.

Implementation: `src/import/select-content.ts`
Verification: `src/import/select-content.test.ts`

### DOCE-IMPORT-3.5 - A title already shown

When a section of the composed document other than the one the content fills shows the document's title, through a title heading or a variable or `{{key}}` token of one of `titleVariables`, the content's own title heading shall be left out, and when it leads the content, past empty paragraphs and page breaks, those and the empty paragraphs and page breaks after it up to the first other block too, so no empty title page is left.

Implementation: `src/model/templates/template-sections.ts`
Verification: `src/model/templates/template-compose.test.ts`

### DOCE-IMPORT-3.6 - Appendices

`findAppendixSection(template, target)` shall give the name of the template's editable section named or labelled `Appendix`, in any case, unless it is `target` (the first editable section by default); null for none. Content composed with sections of that name fills it, created in template order (DOCE-IMPORT-3.2), its tables fitted to its own pages.

Implementation: `src/model/templates/template-sections.ts`
Verification: `src/model/templates/template-compose.test.ts`

## DOCE-IMPORT-4 - Markdown

### DOCE-IMPORT-4.1 - Reading Markdown

`readMarkdown(markdown)` shall give `{ file, warnings }`: a stored document of one section read from CommonMark with GitHub's tables, strikethrough (two tildes), footnotes and task list items, as mdast-util-from-markdown and its GitHub and math extensions parse it. It shall read ATX and setext headings, paragraphs, quotes, bulleted and numbered lists, nested and with their start number, items of several blocks, task list items (`- [ ] `, `- [x] `) as checklist items, fenced code with its language, indented code, `$$` display math, rules, and tables with their header row and column alignment; inline, it shall read strong, emphasis, strikethrough and code, the HTML tags for underline, superscript, subscript, strikethrough, emphasis, strong, code and line breaks, inline links with their title, reference links, autolinks, images, `$` inline math, `{{key}}` variables, escapes and hard line breaks, with marks in the schema's order and adjacent text with the same marks joined. A footnote reference shall become a footnote with its definition's text where it is cited. A paragraph holding only an image shall be a figure; an all-italic paragraph right before a table or right after a figure or a fenced code block that has none shall be its caption, as the writer places them. Front matter shall be left out.

Implementation: `src/model/format/markdown-read.ts`, `src/model/format/markdown-read-blocks.ts`, `src/model/format/markdown-read-inline.ts`, `src/model/format/markdown-read-math.ts`, `src/model/format/markdown-read-variables.ts`
Verification: `src/model/format/markdown-read.test.ts`

### DOCE-IMPORT-4.2 - Markdown left out

An HTML block and an HTML tag the reader does not read shall be left out, the tag keeping its text, each with a `content-left-out` warning naming it.

Implementation: `src/model/format/markdown-read-inline.ts`, `src/model/format/markdown-read-blocks.ts`
Verification: `src/model/format/markdown-read.test.ts`

### DOCE-IMPORT-4.3 - Reading back the writer

A paragraph whose text is all in italics, after a figure or a captionless code block or before a table as the writer places a caption, shall be that object's caption, its italics taken off and its other formats and footnotes kept. Markdown that `writeMarkdown` (DOCE-FORMAT-4.1) wrote for a document of the regression set shall read into a document that `readDocumentFile` reads and that `writeMarkdown` writes as the same Markdown, apart from spaces at line ends, except where the writer itself drops content, which shall then write the same Markdown a second time.

Implementation: `src/model/format/markdown-read.ts`, `src/model/format/markdown-read-captions.ts`
Verification: `src/model/format/markdown-read.test.ts`, `src/model/format/markdown-round-trip.test.ts`

### DOCE-IMPORT-4.4 - Markdown edge cases

Blocks and inlines shall be read as CommonMark reads them: a code fence is closed only by a run of its own character at least as long, a line in fenced code is never a link or footnote definition, even inside a list item or quote, and a definition cannot interrupt a paragraph. `$$` display math is fenced as micromark-extension-math reads it: text after the opening signs is the block's label, left out with a `content-left-out` warning for `math label`. A task list box in a numbered item shall stay text. Inline math shall be read as Pandoc reads it: no space just inside either dollar sign and no digit right after the closing one, so a price such as `$5-$10` stays text; a dollar sign a backslash escapes shall not close it and shall stay in its source, and Markdown between the signs is not read. A `{{key}}` whose first brace a backslash escapes shall stay text. A link's address shall run to the parenthesis that closes the link, holding balanced parentheses and escaped ones, or be given in angle brackets, its escapes read. A tag named after an object property, such as `<constructor>`, shall be a tag the reader does not know (DOCE-IMPORT-4.2). Quotes, lists and formats nested deeper than 32 levels (`MAX_MARKDOWN_DEPTH`) shall give their content to the level above, with a `content-left-out` warning for `nesting`, whatever the depth. Unclosed emphasis, inline math and tags shall take time in proportion to the text: an unclosed dollar sign is looked for once. Runs of mixed emphasis delimiters, deeply nested emphasis and tables thousands of columns wide take mdast-util-from-markdown time that grows faster than the text.

Implementation: `src/model/format/markdown-read.ts`, `src/model/format/markdown-read-math.ts`, `src/model/format/markdown-read-variables.ts`, `src/model/format/markdown-read-depth.ts`, `src/model/format/markdown-read-blocks.ts`
Verification: `src/model/format/markdown-read-edges.test.ts`, `src/model/format/markdown-round-trip.test.ts`
