# Stored Formats

The library stores documents and templates in formats of its own, as JSON a host keeps in its storage through the host adapters (DOCE-HOST-1.3). The formats hold content and settings only: no pages, no split parts and no rendered text, so a server reads them without the editor and the editor's own structure can change without changing what is stored. Each stored file carries `formatVersion`, the library's format number, which changes only when the format does; it is distinct from the host's revision of a saved state. Until the owner's switch to the library the formats change without upgrades; from the switch on, they freeze and change only by a version step (DOCE-FORMAT-8).

## DOCE-FORMAT-1 - Documents

### DOCE-FORMAT-1.1 - Stored document

A stored document (`DocumentFile`) shall hold `formatVersion` 1, the `template` it uses, pinned at a revision (DOCE-TEMPLATES-11.1), and its `sections` in order. A section shall hold the template section it is, by `name` (none for content outside the template's sections), its own settings (DOCE-FORMAT-1.6) and its `content`. Each node shall be `{ type, attrs?, content?, text?, marks? }` with the stored names `STORED_NODE_TYPES` and `STORED_MARK_TYPES` give, and a host's own types under their schema names; an attribute at its default shall be left out. A node of any type shall store the marks it carries as `marks`, a text's and those of any other node alike, such as a mention or a footnote marker a suggestion deletes, so they are read back. Every element shall store its identity and authorship as `id`, `author` and `aiSession`. A footnote shall be stored where it is cited, with its text; math shall store its `source`; a reference's recorded citation data shall be an object. `writeDocumentFile` and `readDocumentFile` shall write and read the format, and a document read and written again shall be unchanged: an empty section, read with one empty paragraph, shall be written empty again.

Implementation: `src/model/format/document-format.ts`, `src/model/format/document-format-write.ts`, `src/model/format/document-format-convert.ts`, `src/model/format/document-format-nodes.ts`
Verification: `src/model/format/document-format.test.ts`, `test/fixtures/documents/regression-set.test.ts`

### DOCE-FORMAT-1.2 - Read for the editor

`readDocumentFile(file, schema, options)` shall give `{ doc, problems }`: the editor's document, each section on one page, with an empty header and footer, its blocks in the page content (an empty paragraph when it has none) and its footnotes' text in the page's footnote area, for the editor to lay out. Overlapping marks of one type shall be read in canonical order (`orderDocumentMarks`, DOCE-SCHEMA-5.1), whatever order they are stored in, so a document read from storage equals the same document built by editing. `readStoredContent(content, schema)` shall read stored content outside a section, such as a template region's, the same way.

Implementation: `src/model/format/document-format-convert.ts`
Verification: `src/model/format/document-format.test.ts`, `src/model/format/document-format-convert.test.ts`

### DOCE-FORMAT-1.3 - Content only

`writeDocumentFile(doc, { template, fragmentRules })` shall store each block split across pages as one whole block (DOCE-PAGINATION-1). It shall leave out pages, page headers and footers, a section's generated styles and copies of its template regions, the part an element is of a split one, continued markers, the entry range a table of contents' part shows, rendered text such as a variable's value, and other layout state.

Implementation: `src/model/format/document-format.ts`, `src/model/format/document-format-write.ts`
Verification: `src/model/format/document-format.test.ts`

### DOCE-FORMAT-1.4 - Unreadable documents

A stored document that is not an object, has another `formatVersion`, or holds a node, mark or attribute the schema does not know, an attribute value not of the kind its type takes (its `validate`, such as a cell's span, DOCE-SCHEMA-3.5), content its type does not allow, or a mark that another mark of its node excludes, shall not be read under the default policy (`unknown: 'throw'`): `readDocumentFile` shall throw a `DocumentFormatError` (`isDocumentFormatError`) whose `path` names the first problem, such as `sections[0].content[2]`.

Implementation: `src/model/format/document-format-convert.ts`, `src/model/format/document-format-nodes.ts`
Verification: `src/model/format/document-format.test.ts`, `src/model/format/document-format-convert.test.ts`

### DOCE-FORMAT-1.5 - Lenient reading

With `unknown: 'drop'`, `readDocumentFile` shall leave out each node it cannot read, with its content, each mark and attribute the schema does not know, each attribute value not of the kind its type takes, so the attribute takes its default, each mark left without an attribute it needs, and each child or mark its parent does not allow, filling a parent that then needs content, and list each in `problems` as `{ path, message, kept: false }`. With `unknown: 'keep'`, it shall do the same, except that a node the schema does not know, or one whose content or marks its type does not allow, shall be kept whole as a kept block or inline node (`kept_block`, `kept_inline`), shown as an empty placeholder that cannot be edited and written back by `writeDocumentFile` exactly as it was stored, and listed with `kept: true`; a block a section does not allow, such as a lone list item, is left out. A mark that another mark of its node excludes, such as a second mark of a type that excludes itself, shall be left out and listed under either lenient policy, keeping the first in canonical order (DOCE-SCHEMA-5.1), so the rest of the document is read. A footnote's text is inline content: a node it does not know is kept in the text, and a footnote whose text cannot be read is kept whole, never read as a marker without its text. Under either policy a file that is not an object, has another `formatVersion` or has no `sections` list shall still throw. Kept nodes are never stored by their own names.

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

`validateTemplateFile(template, options)` shall return an error naming each setting the format does not know and each value not of its setting's kind, such as `template.page.margins.top must be a length with a unit, such as 12pt`; an absent or null setting shall be valid.

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

`writeMarkdown(file)` shall write a stored document as Markdown with GitHub's tables, strikethrough and footnotes: headings, paragraphs and their formats, links, lists, quotes, fenced code with its language, linked code, inline and display math, its stored `source`, between dollar signs, tables with their caption, figures as images with their caption, rules, and footnotes as numbered definitions at the end; underline, superscript and subscript as HTML; page breaks and lists of contents left out. A link whose address a link may not hold (DOCE-SCHEMA-3.8) is written as its text.

Implementation: `src/model/format/markdown.ts`
Verification: `src/model/format/markdown.test.ts`

### DOCE-FORMAT-4.2 - Suggestions and escapes

The suggestions shall be written as if accepted, or rejected when asked (`suggestions`), and the characters Markdown reads as formatting escaped in text.

Implementation: `src/model/format/markdown.ts`
Verification: `src/model/format/markdown.test.ts`

## DOCE-FORMAT-5 - Word processing documents

### DOCE-FORMAT-5.1 - Archives

`writeZip(entries)` shall store files in a zip archive without compression, each with its CRC-32 (`crc32`), followed by the central directory, the same files always making the same archive.

Implementation: `src/model/format/zip.ts`
Verification: `src/model/format/docx.test.ts`

### DOCE-FORMAT-5.2 - Writing a word processing document

`writeDocx(file, { template, suggestions })` shall write a stored document as an Office Open XML word processing document: headings in the heading styles, paragraphs and their formats, links, lists led by their bullets or numbers, quotes, code, math as its stored `source`, tables with their caption and header row, page breaks, rules, figures as their alternative text and caption, and footnotes, in the template's page size, orientation and margins, its suggestions accepted or, when asked, rejected. A link whose address a link may not hold (DOCE-SCHEMA-3.8) is written as its text.

Implementation: `src/model/format/docx.ts`
Verification: `src/model/format/docx.test.ts`

## DOCE-FORMAT-6 - HTML interchange

### DOCE-FORMAT-6.1 - Writing and reading HTML

`writeHtml(doc, document)` shall write a document's content as the schema writes each node, and `readHtml(html, schema, document)` read HTML as the schema reads markup, from an inert document so nothing in it runs or loads.

Implementation: `src/model/format/html.ts`
Verification: `src/model/format/html.test.ts`

### DOCE-FORMAT-6.2 - Word processor HTML

HTML from a word processor (`isWordHtml`) shall be cleaned of the word processor's own markup before it is read or pasted (`cleanWordHtml`, which the clipboard runs, DOCE-EDITING-5.1): conditional comments, Office elements, its style sheets, its class names and the styles they carry are dropped, other styles kept, and runs of its list paragraphs become nested bulleted or numbered lists. Its tracked changes read as accepted, so deleted runs are dropped and inserted runs keep their text, and its comments' references, ranges and texts are dropped: none of them becomes a suggestion or a comment (D12).

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
