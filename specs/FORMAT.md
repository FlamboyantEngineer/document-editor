# Stored Formats

The library stores documents and templates in formats of its own, as JSON a host keeps in its storage through the host adapters (DOCE-HOST-1.3). The formats hold content and settings only: no pages, no split parts and no rendered text, so a server reads them without the editor and the editor's own structure can change without changing what is stored. Each stored file carries `formatVersion`, the library's format number, which changes only when the format does; it is distinct from the host's revision of a saved state. Until the owner's switch to the library the formats change without upgrades; from the switch on, they freeze and change only by a version step (DOCE-FORMAT-8).

## DOCE-FORMAT-1 - Documents

### DOCE-FORMAT-1.1 - Stored document

A stored document (`DocumentFile`) shall hold `formatVersion` 1, the `template` it uses, pinned at a revision (DOCE-TEMPLATES-11.1), and its `sections` in order. A section shall hold the template section it is, by `name` (none for content outside the template's sections), its own settings (DOCE-FORMAT-1.6) and its `content`. Each node shall be `{ type, attrs?, content?, text?, marks? }` with the stored names `STORED_NODE_TYPES` and `STORED_MARK_TYPES` give, and a host's own types under their schema names; an attribute at its default shall be left out. A node of any type shall store the marks it carries as `marks`, a text's and those of any other node alike, such as a mention or a footnote marker a suggestion deletes, so they are read back. Every element shall store its identity and authorship as `id`, `author` and `aiSession`. A footnote shall be stored where it is cited, with its text; math shall store its `source`; a reference's recorded citation data shall be an object. `writeDocumentFile` and `readDocumentFile` shall write and read the format, and a document read and written again shall be unchanged: an empty section, read with one empty paragraph, shall be written empty again.

Implementation: `src/model/format/document-format.ts`, `src/model/format/document-format-write.ts`, `src/model/format/document-format-convert.ts`, `src/model/format/document-format-nodes.ts`
Verification: `src/model/format/document-format.test.ts`, `test/fixtures/documents/regression-set.test.ts`

### DOCE-FORMAT-1.2 - Read for the editor

`readDocumentFile(file, schema, options)` shall give `{ doc, problems }`: the editor's document, each section on one page, with an empty header and footer, its blocks in the page content (an empty paragraph when it has none) and its footnotes' text in the page's footnote area, for the editor to lay out. The editor keeps a footnote's marker and text together by its id, so a footnote stored without an `id`, as an import composes one, or with one an earlier footnote holds, shall be read with an id no other stored footnote holds: the first free one of the element id form (DOCE-EDITING-1.1), counting up from `00000001`, so a file reads the same each time; it is written back with that id. Overlapping marks of one type shall be read in canonical order (`orderDocumentMarks`, DOCE-SCHEMA-5.1), whatever order they are stored in, so a document read from storage equals the same document built by editing. `readStoredContent(content, schema)` shall read stored content outside a section, such as a template region's, the same way.

Implementation: `src/model/format/document-format-convert.ts`
Verification: `src/model/format/document-format.test.ts`, `src/model/format/document-format-convert.test.ts`

### DOCE-FORMAT-1.3 - Content only

`writeDocumentFile(doc, { template, fragmentRules })` shall store each block split across pages as one whole block (DOCE-PAGINATION-1). It shall leave out pages, page headers and footers, a section's generated styles and copies of its template regions, the part an element is of a split one, continued markers, the entry range a table of contents' part shows, rendered text such as a variable's value, and other layout state.

Implementation: `src/model/format/document-format.ts`, `src/model/format/document-format-write.ts`
Verification: `src/model/format/document-format.test.ts`

### DOCE-FORMAT-1.4 - Unreadable documents

A stored document that is not an object, has another `formatVersion`, or holds a node, mark or attribute the schema does not know, an attribute value not of the kind its type takes (its `validate`, such as a cell's span, DOCE-SCHEMA-3.5), content its type does not allow, a mark that another mark of its node excludes, or a key the format does not know at its top level (beside `formatVersion`, `template` and `sections`) or in a section (beside `id`, `name`, `editable`, `header`, `footer` and `content`), shall not be read under the default policy (`unknown: 'throw'`): `readDocumentFile` shall throw a `DocumentFormatError` (`isDocumentFormatError`) whose `path` names the first problem, such as `sections[0].content[2]`.

Implementation: `src/model/format/document-format-convert.ts`, `src/model/format/document-format-nodes.ts`
Verification: `src/model/format/document-format.test.ts`, `src/model/format/document-format-convert.test.ts`

### DOCE-FORMAT-1.5 - Lenient reading

With `unknown: 'drop'`, `readDocumentFile` shall leave out each node it cannot read, with its content, each mark and attribute the schema does not know, each top-level key and section setting the format does not know (under `keep` too), each attribute value not of the kind its type takes, so the attribute takes its default, each mark left without an attribute it needs, and each child or mark its parent does not allow, filling a parent that then needs content, and list each in `problems` as `{ path, message, kept: false }`. With `unknown: 'keep'`, it shall do the same, except that a node the schema does not know, or one whose content or marks its type does not allow, shall be kept whole as a kept block or inline node (`kept_block`, `kept_inline`), shown as an empty placeholder that cannot be edited and written back by `writeDocumentFile` exactly as it was stored, and listed with `kept: true`; the placeholder carries its stored node (`data-kept-node`, as JSON), so a copy, a cut and paste and an HTML round trip (`writeHtml`, `readHtml`) keep it, and a placeholder whose JSON is not a stored node is left out; a block a section does not allow, such as a lone list item, is left out. A mark that another mark of its node excludes, such as a second mark of a type that excludes itself, shall be left out and listed under either lenient policy, keeping the first in canonical order (DOCE-SCHEMA-5.1), so the rest of the document is read. A footnote's text is inline content: a node it does not know is kept in the text, and a footnote whose text cannot be read is kept whole, never read as a marker without its text. Under either policy a file that is not an object, has another `formatVersion` or has no `sections` list shall still throw. Kept nodes are never stored by their own names.

Implementation: `src/model/format/document-format-convert.ts`, `src/model/format/document-format-nodes.ts`, `src/model/format/document-format-write.ts`, `src/model/schema/kept-nodes.ts`
Verification: `src/model/format/document-format-convert.test.ts`

### DOCE-FORMAT-1.6 - Section settings

A stored section shall keep its own `id`, `editable: false` when a writer may not edit its content, and its own page `header` and `footer`, each a region (`RegionSettings`: its content, height, spacing and `inherit`) over its template section's, as `resolveSectionRegion` reads it. `readDocumentFile` shall put them on the section (`dataId`, `editable`, `pageHeader`, `pageFooter`) and `writeDocumentFile` write them back, each left out when unset. A setting of the wrong kind shall not be read: it throws under the default policy and is left out and listed under a lenient one (DOCE-FORMAT-1.5).

Implementation: `src/model/format/document-format.ts`, `src/model/format/document-format-convert.ts`, `src/model/format/document-format-write.ts`, `src/model/schema/page-nodes.ts`
Verification: `src/model/format/document-format.test.ts`

## DOCE-FORMAT-2 - Templates

### DOCE-FORMAT-2.1 - Stored template

A stored template (`TemplateFile`) shall hold `formatVersion` 1, its `id`, and optionally its `name`, its `parent`, and its `page`, `styles`, `header`, `footer`, `footnotes`, `references`, `changeBars`, `sections` and the host's own `extensions`, as `TEMPLATE_SHAPE` describes. Lengths shall carry their unit, colors shall be hex colors, a line height shall be a multiple of the font size and a font weight a number. A header, footer or section's content shall be stored content (DOCE-FORMAT-1.1).

Implementation: `src/model/format/template-format.ts`, `src/model/format/template-format-shape.ts`, `src/model/format/template-format-validate.ts`
Verification: `src/model/format/template-format.test.ts`

### DOCE-FORMAT-2.2 - Setting validation

`validateTemplateFile(template, options)` shall return an error naming each setting the format does not know and each value not of its setting's kind, such as `template.page.margins.top must be a length with a unit, such as 12pt`; an absent or null setting shall be valid. A setting is known by the format's own names only: one named like a member of every object, such as `constructor` or `__proto__`, shall be reported as not a template setting, whatever its value, and never make validation throw.

Implementation: `src/model/format/template-format-validate.ts`, `src/model/format/template-format-shape.ts`
Verification: `src/model/format/template-format.test.ts`

### DOCE-FORMAT-2.3 - Identity, references and sections

A template's `id` shall use letters, digits, underscores and hyphens, its `name` at most 120 characters without control or formatting characters, and its `parent` shall not be itself. Its reference formats and links shall be keyed by known format keys, with the host's `referenceTypes` (DOCE-SCHEMA-4.1), and each format shall be valid. Its sections' names shall use lower-case letters, digits and underscores and be unique.

Implementation: `src/model/format/template-format-validate.ts`
Verification: `src/model/format/template-format.test.ts`

### DOCE-FORMAT-2.4 - Template content

Given a schema, `validateTemplateFile` shall read each content setting as stored content and report where it cannot be read. A header's or footer's content shall hold only what a page header or footer holds, blocks: a node it does not allow, such as a column layout, which only a section's content holds, shall be reported by its place, such as `template.header.content: [1]: a page header or footer does not allow columns`. `TEMPLATE_SHAPE` names a region's content as a kind of its own, `regionContent`.

Implementation: `src/model/format/template-format-validate.ts`, `src/model/format/template-format-shape.ts`
Verification: `src/model/format/template-format.test.ts`

## DOCE-FORMAT-3 - Template inheritance

### DOCE-FORMAT-3.1 - One inheritance rule

`mergeTemplateFiles(parent, child)` shall merge a template over its parent into a copy: a setting that is absent or null takes the parent's value, objects merge setting by setting, a list replaces the parent's list whole, except a list of `levels` (paragraph numbering and contents levels), which merges level by level by its place, so a null level takes the parent's, a header or footer with `inherit: true` takes the parent's, and any other value, an empty string included, is the template's own. The merged template shall keep its own `id` and `parent`.

Implementation: `src/model/format/template-format-resolve.ts`
Verification: `src/model/format/template-format-resolve.test.ts`, `src/model/templates/template-settings.test.ts`

### DOCE-FORMAT-3.2 - Inherited chains

`resolveTemplateFile(template, options)` shall merge the chain a template inherits under it: its `parent`, that template's parent, and so on, and a template without a parent shall inherit the host's `baseTemplateId` unless it is that template. The host shall load each template through `loadTemplate`; `resolveTemplateFileAsync` shall take an asynchronous loader through the same steps. A chain that comes back to a template it holds shall stop there, and a template the loader does not find shall end it.

Implementation: `src/model/format/template-format-resolve.ts`
Verification: `src/model/format/template-format-resolve.test.ts`

### DOCE-FORMAT-3.3 - Parent cycles

`hasTemplateParentCycle(templateId, parentId, loadTemplate)` and its asynchronous form shall tell whether giving a template that parent would make its chain come back to it.

Implementation: `src/model/format/template-format-resolve.ts`
Verification: `src/model/format/template-format-resolve.test.ts`

### DOCE-FORMAT-3.4 - Section regions

`resolveSectionRegion(template, section, region)` shall give a section the template's page header or footer when the section has none or asks to inherit, and otherwise the section's region settings over the template's, field by field, so a section that sets only a height keeps the template's content and one that sets empty content shows none.

Implementation: `src/model/format/template-format-resolve.ts`
Verification: `src/model/format/template-format-resolve.test.ts`

## DOCE-FORMAT-4 - Markdown

### DOCE-FORMAT-4.1 - Writing Markdown

`writeMarkdown(file)` shall write a stored document as Markdown with GitHub's tables, strikethrough and footnotes: headings, paragraphs and their formats, links, lists, quotes, fenced code with its language and caption, linked code, inline and display math, its stored `source`, between dollar signs, tables with their caption, figures and inline images as images, a figure with its caption, rules, and footnotes as numbered definitions at the end; underline, superscript and subscript as HTML; page breaks and lists of contents left out. A link whose address a link may not hold (DOCE-SCHEMA-3.8) is written as its text.

Implementation: `src/model/format/markdown.ts`, `src/model/format/markdown/blocks.ts`, `src/model/format/markdown/inlines.ts`
Verification: `src/model/format/markdown.test.ts`

### DOCE-FORMAT-4.2 - Suggestions and escapes

The suggestions shall be written as if accepted, or rejected when asked (`suggestions`), and the characters Markdown reads as formatting escaped in text. What Markdown would read at the start of a line as a block, a heading's number sign, a list item's marker or number, or a rule, shall be escaped there, also after a line break; the spaces at the edges of formatted or linked text shall be written outside its markers; and a pipe in code or math inside a table shall be escaped, so it does not end the cell.

Implementation: `src/model/format/markdown/escape.ts`, `src/model/format/markdown/inlines.ts`, `src/model/format/markdown/blocks.ts`
Verification: `src/model/format/markdown.test.ts`

### DOCE-FORMAT-4.3 - Suggested blocks

A writer that writes the suggestions as accepted shall leave out each block suggested for deletion, such as a figure or the paragraph a suggestion splits, and one that writes them as rejected each block suggested as an insertion (`isLeftOut`), with its content; a list item whose blocks are all left out shall be left out with its marker.

Implementation: `src/model/format/left-out.ts`, `src/model/format/markdown/blocks.ts`
Verification: `src/model/format/markdown.test.ts`

### DOCE-FORMAT-4.4 - Fidelity

Code shall be fenced by a run of backticks longer than any it holds, three at least for a block, and a code span that starts or ends with a backtick padded with a space. A link's address shall be written so that nothing in it ends the link: a space, a control character or a backslash percent-encoded and a parenthesis escaped, with the link's title quoted after it; a code span keeps its link. An entity reference in text and a heading's closing run of number signs shall be escaped. A table's merged cell shall be written in its first place, and the places it covers left empty, so each row is as wide as the table; a cell's paragraphs and line breaks shall be joined by `<br>` on its one line. A figure or image stored by asset shall be written at the address `values.asset({ id, revision })` gives (`assetAddress`, DOCE-FORMAT-5.3), else at its own `src`, and a figure with no address as its caption alone.

Implementation: `src/model/format/markdown/escape.ts`, `src/model/format/markdown/inlines.ts`, `src/model/format/markdown/tables.ts`, `src/model/format/writer-values.ts`
Verification: `src/model/format/markdown-fidelity.test.ts`

### DOCE-FORMAT-4.5 - Values and format changes

A variable shall be written as the text `values.variable(key)` gives, or as its key in braces when it gives none (`variableText`, DOCE-FORMAT-5.3). A template block shall be written as the text of its source, each variable token replaced in the same way, its tags left out and its paragraphs kept; a template block without a source is left out. When the suggestions are written as rejected, text whose format a suggestion changed shall be written in the formats it had before.

Implementation: `src/model/format/markdown/inlines.ts`, `src/model/format/markdown/blocks.ts`
Verification: `src/model/format/markdown-fidelity.test.ts`

### DOCE-FORMAT-4.6 - Title and front matter

`frontMatter` shall be written first as YAML front matter between `---` lines, each property's value as JSON, which YAML reads as the same value, and a key YAML would not read as itself quoted; a property whose value is undefined is left out. `title` shall be written next as a level-1 heading.

Implementation: `src/model/format/markdown/front-matter.ts`, `src/model/format/markdown.ts`
Verification: `src/model/format/markdown-appendix.test.ts`

### DOCE-FORMAT-4.7 - Comment threads

The comment threads given as `threads` (a host's `CommentThread` is one) shall be listed after the text under a "Comments" heading, in the order of their first anchor in the document and threads with none, such as one about the whole document, last. Each shall name the text it is on, or the document, and whether it is resolved, with its comments in order, each by its author's name (`person`, or the id when it gives none) and date. A reply still being written or that failed shall not be listed, and a thread with no comment left is not listed.

Implementation: `src/model/format/markdown/appendix.ts`
Verification: `src/model/format/markdown-appendix.test.ts`

### DOCE-FORMAT-4.8 - Suggestion list

With `suggestionList`, the document's suggestions shall be listed under a "Suggestions" heading, in the order of their place in the document, one item for each suggestion by its id or thread: what it inserts, deletes, replaces or formats, with a block that holds no text, such as a figure, named by its type, and its author's name when it is stored. Neither list shall be written when there is nothing to list.

Implementation: `src/model/format/markdown/appendix.ts`
Verification: `src/model/format/markdown-appendix.test.ts`

### DOCE-FORMAT-4.9 - Golden Markdown

`test/fixtures/markdown/` shall hold each regression-set document (`test/fixtures/documents/`) as `writeMarkdown` writes it, the comments document with its threads and suggestion list and with its suggestions rejected, the variables document with its values, title and front matter, and the figures document with its asset addresses; each document shall be written exactly as its golden file.

Implementation: `src/model/format/markdown.ts`
Verification: `src/model/format/markdown-golden.test.ts`

## DOCE-FORMAT-5 - Word processing documents

### DOCE-FORMAT-5.1 - Archives

`writeZip(entries)` shall store files in a zip archive without compression, each with its CRC-32 (`crc32`), followed by the central directory, the same files always making the same archive.

Implementation: `src/model/format/zip.ts`
Verification: `src/model/format/docx.test.ts`

### DOCE-FORMAT-5.2 - Writing a word processing document

`writeDocx(file, { template, suggestions, values, comments })` shall write a stored document as an Office Open XML word processing document, faithful to its resolved template (the base template when none is given): headings, paragraphs and their formats, links (a link whose address a link may not hold, DOCE-SCHEMA-3.8, written as its text), lists, quotes, code as one paragraph per block with its lines parted by line breaks, math as its stored `source`, tables, page breaks, rules, figures as their alternative text and address, a table of contents as a field the word processor fills in, and footnotes, its suggestions accepted or, when asked, rejected. Each part shall name the addresses it links to by its own relationships (the document's, a footnote's, a header's or a footer's), and the characters XML cannot hold, control characters other than the tab and the line breaks, shall be left out of every part. The parts use the style ids, numbering names and section list a reader shares (DOCE-FORMAT-5.4 to 5.7). A release checks a sample of the regression set in a word processor by hand.

Implementation: `src/model/format/docx.ts`, `src/model/format/docx/blocks.ts`, `src/model/format/docx/inline.ts`, `src/model/format/docx/package.ts`
Verification: `src/model/format/docx.test.ts`

### DOCE-FORMAT-5.3 - What a writer leaves out and resolves

Every writer shall apply one rule to a document's suggestions (`isLeftOut`, `keptContent`): written as if accepted, it leaves out a suggested deletion; written as if rejected, a suggested insertion; a block suggested whole, such as a figure or the halves of a split paragraph, by its `suggestionKind`, and inline content by its insertion or deletion mark. A writer shall resolve the values the document names but does not hold through the host's `values` (`WriterValues`): a variable as its text, or its key in double braces when the host has none (`variableText`), and an asset as the address the host gives, or the node's own `src` (`assetAddress`).

Implementation: `src/model/format/left-out.ts`, `src/model/format/writer-values.ts`, `src/model/format/docx.ts`
Verification: `src/model/format/left-out.test.ts`, `src/model/format/docx.test.ts`

### DOCE-FORMAT-5.4 - Template styles in a word processing document

The template's styles shall become the document's styles, by ids a reader shares: the paragraph style as `Normal`, the title as `Title`, heading levels as `Heading1` to `Heading6` with their outline levels, paragraph levels 2 to 6 as `ParagraphLevel2` to `ParagraphLevel6`, each custom style as `Custom_<key>` named by its key, and the list, quote, code, caption, table header and footnote styles, each with its font, size, weight, italics, underline, color, line height, alignment, spacing and background. A heading or paragraph in a custom style takes that style, a heading keeping its outline level.

Implementation: `src/model/format/docx/styles.ts`, `src/model/format/docx/word-properties.ts`, `src/model/format/docx/word-xml.ts`, `src/model/format/docx/paragraphs.ts`
Verification: `src/model/format/docx/styles.test.ts`, `src/model/format/docx-regression.test.ts`

### DOCE-FORMAT-5.5 - Numbering in a word processing document

Headings and paragraphs of the document's structure shall be numbered with the word processor's own numbering, from the template's formats, prefixes and suffixes as the editor numbers them (`Headings` and `Paragraphs` definitions per numbering scope, a section that restarts numbering starting them again, the paragraphs counting again after each heading); lists shall use the template's bullet and number format (`Bullets` and `Numbers`), each numbered list counting from its start; and the captions of tables, figures and code, and the numbers of equations, shall show their numbers as the editor counts them, the caption's label in the `CaptionLabel` style. Headings and paragraphs in lists, tables, quotes and page regions, the title, and a heading stored as `numbered: false` are not numbered; such a heading moves no heading or object counter, though the paragraphs after it count again.

Implementation: `src/model/format/docx/numbering.ts`, `src/model/format/docx/numbering-levels.ts`, `src/model/format/docx/counting.ts`, `src/model/format/docx/tables.ts`
Verification: `src/model/format/docx/numbering.test.ts`, `src/model/format/docx-regression.test.ts`

### DOCE-FORMAT-5.6 - Sections, pages and regions in a word processing document

Each stored section shall be a section of the document, with its template section's page size, orientation and margins over the template's, and its page header and footer, the section's own over its template section's over the template's, with `page.current` and `page.total` as page fields and other variables as their values in content controls tagged `variable:<key>`. Once any section has a header or footer, every section names its own. The settings shall list each section's template section name in order (`sections`).

Implementation: `src/model/format/docx/sections.ts`, `src/model/format/docx/regions.ts`, `src/model/format/docx/notes.ts`
Verification: `src/model/format/docx-regression.test.ts`

### DOCE-FORMAT-5.7 - Footnotes and comments in a word processing document

Footnotes shall be numbered as the template numbers them, through the document or on each page. The comment threads the host passes (`comments.threads`) that the document anchors shall be written as comments around their text, one per entry with its author's name (`comments.authorName`) and date, the replies linked to the opening comment, and a resolved thread marked done; a thread the document does not anchor, or that is left out with its text, is not written.

Implementation: `src/model/format/docx/comments.ts`, `src/model/format/docx/notes.ts`
Verification: `src/model/format/docx/comments.test.ts`, `src/model/format/docx-regression.test.ts`

### DOCE-FORMAT-5.8 - Reading back a written document

A document the writer writes shall read back with the library's reader (`readDocx`, DOCE-IMPORT) into the same template sections, blocks, heading levels, paragraph levels and styles, and footnotes, except for the content the writer writes with a loss: columns as their blocks, scripts and template blocks as their content, lists of contents other than the table of contents, linked code as code, display math as a paragraph, figures as placeholders, and quotes nested in quotes written flat.

Implementation: `src/model/format/docx.ts`
Verification: `src/model/format/docx-round-trip.test.ts`

## DOCE-FORMAT-6 - HTML interchange

### DOCE-FORMAT-6.1 - Writing and reading HTML

`writeHtml(doc, document)` shall write a document's content as the schema writes each node, and `readHtml(html, schema, document)` read HTML as the schema reads markup, from an inert document so nothing in it runs or loads.

Implementation: `src/model/format/html.ts`
Verification: `src/model/format/html.test.ts`

### DOCE-FORMAT-6.2 - Word processor HTML

HTML from a word processor (`isWordHtml`) shall be cleaned of the word processor's own markup before it is read or pasted (`cleanWordHtml`, which the clipboard runs, DOCE-EDITING-5.1): conditional comments, Office elements, its style sheets, its class names and the styles they carry are dropped, other styles kept, and runs of its list paragraphs become nested bulleted or numbered lists, a paragraph of another list, of another instance of a list (one numbered again from its start) or of the other kind starting a list of its own. Its tracked changes read as accepted, so deleted runs are dropped and inserted runs keep their text, and its comments' references, ranges and texts are dropped: none of them becomes a suggestion or a comment (D12).

Implementation: `src/model/format/html.ts`, `src/engine/clipboard.ts`
Verification: `src/model/format/html.test.ts`, `src/engine/clipboard.test.ts`, `e2e/full-editor.spec.ts`

### DOCE-FORMAT-6.3 - HTML content for regions and sections

`readHtmlContent(html, schema, document)` shall read HTML, such as a template header's or a section's content a host keeps as markup, as stored content: its blocks as the schema reads them, inline text in paragraphs, word processor markup cleaned, from an inert document so nothing in it runs or loads. Variables stay variables, and `{{key}}` tokens stay text for the template's content to read (DOCE-TEMPLATES-8.1).

Implementation: `src/model/format/html.ts`
Verification: `src/model/format/html.test.ts`

## DOCE-FORMAT-7 - Contract tests

Committed snapshots lock what stored and pasted documents depend on. Until the owner's switch to the library, a change to any of them shall come with the matching change to this spec or to DOCUMENT-SCHEMA.md and the updated snapshot, and needs no upgrade step; from the switch on, it shall also step `formatVersion`. A snapshot is updated with `npx vitest run -u` on the test that holds it, never by editing the test's expectations away.

### DOCE-FORMAT-7.1 - Schema fingerprint

The document schema's fingerprint shall match the committed `src/model/schema/schema-fingerprint.snapshot.json`: each node and mark type in schema order with its ordinal, its group, content and marks expressions and flags, each attribute's default (or that it is required) and the kinds of value it takes, its parse rules, and the markup it writes with its attributes at their defaults and with every attribute set. A change to an attribute default, a parse tag or the markup a type writes shall fail the test.

Implementation: `src/model/schema/document-schema.ts`, `src/model/schema/node-order.ts`
Verification: `src/model/schema/schema-fingerprint.test.ts`

### DOCE-FORMAT-7.2 - Stored-format golden files

`test/fixtures/format/` shall hold a stored document for every stored node type, a type that sits only inside another (list items, table rows and cells, columns) within its parent's file, and one for every stored mark type, with each stored attribute set away from its default, and a node other than text that carries marks. Each shall read and write back unchanged (DOCE-FORMAT-1.1), and a stored type or attribute name that changes shall fail to read.

Implementation: `src/model/format/document-format.ts`, `src/model/format/document-format-convert.ts`
Verification: `src/model/format/stored-format-golden.test.ts`

### DOCE-FORMAT-7.3 - Plugin and fragment-rule registries

The editing plugins (DOCE-EDITING-3.1) shall run in a recorded order of plugin keys, with and without a template and from `createDocumentEditing` and its kit extension alike, and `FRAGMENT_RULES` shall record which types split, the attributes their whole block takes, and which join or continue by their own rule, naming only schema types and attributes.

Implementation: `src/engine/document-editing.ts`, `src/model/pagination/fragments.ts`
Verification: `src/engine/features.test.ts`

## DOCE-FORMAT-8 - Format versions

The stored formats freeze at version 1 on the day of the owner's switch to the library (D11). Until then a change to them needs only the matching spec change and updated snapshots (DOCE-FORMAT-7). From then on, a change to a stored name also steps `DOCUMENT_FORMAT_VERSION` or `TEMPLATE_FORMAT_VERSION` and adds an upgrade step.

### DOCE-FORMAT-8.1 - Upgrades

`upgradeDocumentFile(file)` and `upgradeTemplateFile(file)` shall bring a stored file to the current format version, one version step at a time, before it is read (`readDocumentFile`) or validated (`validateTemplateFile`). A file already at the current version shall be given back as it is, and one whose version has no step, or that is not an object, shall be given back for the reader to refuse. Until the freeze there is no step.

Implementation: `src/model/format/format-upgrade.ts`
Verification: `src/model/format/format-upgrade.test.ts`

### DOCE-FORMAT-8.2 - Freeze guard

A test shall record the stored names of both formats, the document's node and mark types with their attributes (`STORED_NODE_TYPES`, `STORED_MARK_TYPES`) and every template setting path (`TEMPLATE_SHAPE`), and, once switched on, compare them with the record committed for the current versions in `test/fixtures/format-versions/`, so a change to a stored name without a version step fails. It is switched off until the freeze. To freeze, set `FROZEN` in the test, run it once to write the record for version 1, and commit the record; to step a version later, add the upgrade step, step the version and commit the new record the test writes beside the old ones.

Implementation: `src/model/format/document-format.ts`, `src/model/format/template-format-shape.ts`
Verification: `src/model/format/format-upgrade.test.ts`

## DOCE-FORMAT-9 - Stored-file readers

A server reads and changes stored documents without the editor's view through the readers in `./document`, which load no DOM. Those that read the "stored JSON" walk the stored nodes alone; the others read the document with the host's schema (`readDocumentFile`) and reuse the editor's own logic, so a server and the editor agree. A reader that writes a document back reads it with `unknown: 'keep'`, so content the schema cannot read is written back as it was stored (DOCE-FORMAT-1.5). Paths name a stored node as `checkStoredIds` does, such as `sections[0].content[2]`.

Each server job that reads or writes document content maps to one reader. The table lists the jobs each reader covers; the host's inventory of its own server code adds a row for each job it finds, by the job, never by the host's names.

| Reader                     | Reads                 | Server job                                                                                                                              |
| -------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `findStoredElement`        | stored JSON           | Look up an element by its id, such as a link, an agent edit, a figure to replace or the text around a thread for an assistant's prompt. |
| `storedDocumentText`       | schema                | Search projection, summaries and previews, and word-level indexing.                                                                     |
| `storedCitations`          | stored JSON           | Citation lists, checks of what a document cites and the inbound "cited by" lists of the documents and records it cites.                 |
| `storedEmbeds`             | stored JSON           | The records and data sets a document embeds, for their inbound lists.                                                                   |
| `documentTargets`          | schema, template      | Reference pickers and checks of what may be cited.                                                                                      |
| `validateRequiredSections` | stored JSON, template | Checking a document is complete before it moves on.                                                                                     |
| `threadAnchors`            | stored JSON           | Comment resolution: which threads still hold text, and what; dropping threads whose text is gone.                                       |
| `updateStoredThreads`      | schema                | Resolving, reopening or removing a thread outside the editor.                                                                           |
| `replaceTemplate`          | schema, template      | Moving documents to another template or revision.                                                                                       |
| `decideStoredSuggestions`  | schema                | Accepting or rejecting suggestions outside the editor, and reading a document with its pending suggestions applied or left out.         |
| `storedContributors`       | stored JSON           | Contributor lists, and who changed a document since a version.                                                                          |
| `authoredContent`          | stored JSON           | Review evidence: whether the reviewed content, or a heading's span of it, changed since it was approved.                                |

Jobs on stored documents that other entries cover: agent and assistant edits, and comments anchored on exact text, are `applyStoredEdits`, with `describeDocument` to read what they target (AUTOMATION.md); script runs, signature output and generated content are `runStoredScripts`; comparing two versions is `compareVersions`, and merging a save into the latest one is `mergeDocuments` (SESSION.md), both in `./document`; a shared room's seed and its saved state are `documentToYjs` and `yjsToDocument` in `./collab`; imported files are `readDocx` and `composeDocumentFile` in `./import`; print and PDF pages are `printSnapshot`.

### DOCE-FORMAT-9.1 - Element by id

`findStoredElement(file, id)` shall give the element of a stored document with an element id, its path, its section and the id of the element holding it (null at a section's top), or null when none has it. A footnote shall be found by its element id (`elementId`), not its footnote id.

Implementation: `src/document/stored-elements.ts`, `src/document/stored-walk.ts`
Verification: `src/document/stored-elements.test.ts`, `e2e/automation-lab.spec.ts`

### DOCE-FORMAT-9.2 - Document text

`storedDocumentText(file, schema)` shall give a stored document's text, one line per text block in reading order, each section's footnotes' text after its content: text as it is, a line break as one, and an inline object as the text search reads it as (`shownText`), or nothing when it shows none. It shall read the text with every suggestion accepted, leaving out text a suggestion deletes, and leave out blocks without text and nodes the schema cannot read.

Implementation: `src/document/stored-text.ts`, `src/engine/search-text.ts`
Verification: `src/document/stored-text.test.ts`, `e2e/automation-lab.spec.ts`

### DOCE-FORMAT-9.3 - Citations

`storedCitations(file)` shall list a stored document's citations in reading order, footnotes' where they are cited: each run of inline content one reference mark covers, joined across nodes that other marks part, with its `target`, its `referenceType` (`internal-heading` when stored at its default), whether it is `broken`, its text, its path, the id of the element holding it and the mark's stored attributes.

Implementation: `src/document/stored-elements.ts`, `src/document/stored-walk.ts`
Verification: `src/document/stored-elements.test.ts`, `e2e/automation-lab.spec.ts`

### DOCE-FORMAT-9.4 - Reference targets

`documentTargets(file, { schema, template })` shall list the targets a reference may cite in a stored document, as the editor's reference picker does (`referenceTargets`): its headings, figures, tables, code blocks and equations with an element id, by kind and then in reading order, each with its number as the resolved template prints it, its title and its label.

Implementation: `src/document/stored-template.ts`
Verification: `src/document/stored-template.test.ts`, `e2e/automation-lab.spec.ts`

### DOCE-FORMAT-9.5 - Required sections

`validateRequiredSections(file, template)` shall list, in the resolved template's order, each required section a stored document lacks (`missing`) and each required section a writer may edit that it holds with nothing but empty paragraphs (`empty`). A section the writer cannot edit is never reported empty.

Implementation: `src/document/stored-template.ts`
Verification: `src/document/stored-template.test.ts`, `e2e/automation-lab.spec.ts`

### DOCE-FORMAT-9.6 - Thread anchors

`threadAnchors(file)` shall list the comment threads a stored document's text is anchored to, in the order they start, one per thread: its state (`resolved` when its comment anchor says so, else `open`), the stored marks that tie it to the text (`comment`, `insertion`, `deletion`, `formatChange`), its text, each run once, joined by spaces, and the ids of the elements holding its runs.

Implementation: `src/document/stored-elements.ts`, `src/document/stored-walk.ts`
Verification: `src/document/stored-elements.test.ts`, `e2e/automation-lab.spec.ts`

### DOCE-FORMAT-9.7 - Template replacement

`replaceTemplate(file, { schema, template, revision })` shall give a stored document moved to a resolved template, pinned at `revision` (its latest when none is given), with its sections brought in line as the editor does (`syncTemplateSections`, DOCE-SECTIONS-4.2): a section the writer cannot edit takes the template's content, a section of a name the template does not have becomes a plain section with its content, and a missing required section is added where the template places it.

Implementation: `src/document/stored-template.ts`
Verification: `src/document/stored-template.test.ts`, `e2e/automation-lab.spec.ts`

### DOCE-FORMAT-9.8 - Suggestion decisions

`decideStoredSuggestions(file, { schema, decision, ids, threadAuthor })` shall accept or reject a stored document's suggestions, every one or those with the given ids, as the editor decides them (`decideSuggestions`), and give the document with its template pin, the ids it decided, each once, and the other suggestions the decision removed. When nothing changes, it shall give the document back as it was.

Implementation: `src/document/stored-suggestions.ts`
Verification: `src/document/stored-suggestions.test.ts`, `e2e/automation-lab.spec.ts`

### DOCE-FORMAT-9.9 - Embeds

`storedEmbeds(file)` shall list a stored document's embeds in reading order: each one's element id, its `kind`, `source`, `snapshot` (null when it records none) and `label`, its path and the id of the element holding it (null at a section's top).

Implementation: `src/document/stored-elements.ts`, `src/document/stored-walk.ts`
Verification: `src/document/stored-elements.test.ts`

### DOCE-FORMAT-9.10 - Contributors

`storedContributors(file, { since })` shall list a stored document's writers, each once, in the reading order of what they wrote: the `author` each element records and the `author` each mark on its inline content records, such as a contributor mark or a suggestion. Given an earlier version (`since`), it shall list only an element's author when the element is new, and a mark's writer when the element holding the mark is new or differs from its earlier version.

Implementation: `src/document/stored-contributors.ts`, `src/document/stored-walk.ts`
Verification: `src/document/stored-contributors.test.ts`

### DOCE-FORMAT-9.11 - Thread changes

`updateStoredThreads(file, { schema, changes })` shall mark each named thread's comment anchor open or resolved, or remove it and leave its text, as the editor does (`setCommentState`, `removeCommentAnchor`), and give the document with its template pin and the threads whose anchor changed, in the order given. A suggestion the thread discusses shall stay as it is. When no anchor changes, it shall give the document back as it was.

Implementation: `src/document/stored-threads.ts`, `src/engine/comments.ts`
Verification: `src/document/stored-threads.test.ts`

### DOCE-FORMAT-9.12 - Authored content

`authoredContent(file, { headings, attrs, leaveOutput })` shall give a stored document's authored content as canonical JSON text, with object keys sorted, that a host hashes, and the heading ids it did not find (`missing`). It shall leave out comment anchors and contributor marks, the attributes that record who wrote (`author`, `aiSession`), which thread discusses a suggestion (`thread`) and when and how a script ran (`renderedAt`, `provenance`, `signatures`), the stored attributes named in `attrs`, such as a host's element state, and the output of each script whose source `leaveOutput` names; text nodes beside one another with the same marks shall read as one. With `headings`, it shall read only the span of each named heading at a section's top that is not the title: from the heading to the next such heading of its level or above, across sections.

Implementation: `src/document/authored-content.ts`, `src/session/stored-equality.ts`
Verification: `src/document/authored-content.test.ts`
