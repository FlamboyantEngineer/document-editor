# Stored Formats

The library stores documents and templates in formats of its own, as JSON a host keeps in its storage through the host adapters (DOCE-HOST-1.3). The formats hold content and settings only: no pages, no split parts and no rendered text, so a server reads them without the editor and the editor's own structure can change without changing what is stored. Each stored file carries `formatVersion`, the library's format number, which changes only when the format does; it is distinct from the host's revision of a saved state. Until the library's 1.0.0 release the formats are experimental and change without upgrades.

## DOCE-FORMAT-1 - Documents

### DOCE-FORMAT-1.1 - Stored document

A stored document (`DocumentFile`) shall hold `formatVersion` 1, the id of the `template` it uses, and its `sections` in order. A section shall hold the template section it is, by `name` (none for content outside the template's sections), and its `content`. Each node shall be `{ type, attrs?, content?, text?, marks? }` with the stored names `STORED_NODE_TYPES` and `STORED_MARK_TYPES` give, and a host's own types under their schema names; an attribute at its default shall be left out. Every element shall store its identity and authorship as `id`, `author` and `aiSession`. A footnote shall be stored where it is cited, with its text; math shall store its `source`; a reference's recorded citation data shall be an object. `writeDocumentFile` and `readDocumentFile` shall write and read the format, and a document read and written again shall be unchanged.

Implementation: `src/model/format/document-format.ts`, `src/model/format/document-format-convert.ts`
Verification: `src/model/format/document-format.test.ts`

### DOCE-FORMAT-1.2 - Read for the editor

`readDocumentFile(file, schema)` shall build the editor's document: each section on one page, with an empty header and footer, its blocks in the page content (an empty paragraph when it has none) and its footnotes' text in the page's footnote area, for the editor to lay out. `readStoredContent(content, schema)` shall read stored content outside a section, such as a template region's, the same way.

Implementation: `src/model/format/document-format-convert.ts`
Verification: `src/model/format/document-format.test.ts`

### DOCE-FORMAT-1.3 - Content only

`writeDocumentFile(doc, { template, fragmentRules })` shall store each block split across pages as one whole block (DOCE-PAGINATION-1). It shall leave out pages, page headers and footers, a section's generated styles and copies of its template regions, the part an element is of a split one, continued markers, the entry range a table of contents' part shows, rendered text such as a variable's value, and other layout state.

Implementation: `src/model/format/document-format.ts`, `src/model/format/document-format-convert.ts`
Verification: `src/model/format/document-format.test.ts`

### DOCE-FORMAT-1.4 - Unreadable documents

A stored document that is not an object, has another `formatVersion`, or holds a node, mark or attribute the schema does not know, or content its type does not allow, shall not be read: `readDocumentFile` shall throw a `DocumentFormatError` (`isDocumentFormatError`) whose `path` names the first problem, such as `sections[0].content[2]`.

Implementation: `src/model/format/document-format-convert.ts`
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

Given a schema, `validateTemplateFile` shall read each content setting as stored content and report where it cannot be read.

Implementation: `src/model/format/template-format-validate.ts`
Verification: `src/model/format/template-format.test.ts`

## DOCE-FORMAT-3 - Template inheritance

### DOCE-FORMAT-3.1 - One inheritance rule

`mergeTemplateFiles(parent, child)` shall merge a template over its parent into a copy: a setting that is absent or null takes the parent's value, objects merge setting by setting, a list replaces the parent's list whole, a header or footer with `inherit: true` takes the parent's, and any other value, an empty string included, is the template's own. The merged template shall keep its own `id` and `parent`.

Implementation: `src/model/format/template-format-resolve.ts`
Verification: `src/model/format/template-format-resolve.test.ts`

### DOCE-FORMAT-3.2 - Inherited chains

`resolveTemplateFile(template, options)` shall merge the chain a template inherits under it: its `parent`, that template's parent, and so on, and a template without a parent shall inherit the host's `baseTemplateId` unless it is that template. The host shall load each template through `loadTemplate`; `resolveTemplateFileAsync` shall take an asynchronous loader through the same steps. A chain that comes back to a template it holds shall stop there, and a template the loader does not find shall end it.

Implementation: `src/model/format/template-format-resolve.ts`
Verification: `src/model/format/template-format-resolve.test.ts`

### DOCE-FORMAT-3.3 - Parent cycles

`hasTemplateParentCycle(templateId, parentId, loadTemplate)` and its asynchronous form shall tell whether giving a template that parent would make its chain come back to it.

Implementation: `src/model/format/template-format-resolve.ts`
Verification: `src/model/format/template-format-resolve.test.ts`

### DOCE-FORMAT-3.4 - Section regions

`resolveSectionRegion(template, section, region)` shall give a section its own page header or footer, or the template's when the section has none or asks to inherit.

Implementation: `src/model/format/template-format-resolve.ts`
Verification: `src/model/format/template-format-resolve.test.ts`

## DOCE-FORMAT-4 - Markdown

### DOCE-FORMAT-4.1 - Writing Markdown

`writeMarkdown(file)` shall write a stored document as Markdown with GitHub's tables, strikethrough and footnotes: headings, paragraphs and their formats, links, lists, quotes, fenced code with its language, linked code, inline and display math between dollar signs, tables with their caption, figures as images with their caption, rules, and footnotes as numbered definitions at the end; underline, superscript and subscript as HTML; page breaks and lists of contents left out.

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

`writeDocx(file, { template, suggestions })` shall write a stored document as an Office Open XML word processing document: headings in the heading styles, paragraphs and their formats, links, lists led by their bullets or numbers, quotes, code, math as its source, tables with their caption and header row, page breaks, rules, figures as their alternative text and caption, and footnotes, in the template's page size, orientation and margins, its suggestions accepted or, when asked, rejected.

Implementation: `src/model/format/docx.ts`
Verification: `src/model/format/docx.test.ts`
