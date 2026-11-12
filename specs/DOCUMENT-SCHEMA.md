# Document Schema

The document schema defines every node and mark type a document holds and the markup each one reads and writes. Stored documents, pasted content and exports all go through it, so its markup is a compatibility contract: a type's element, attributes and parse rules change only through a change to this spec. The schema is assembled from extensions of the base component library's rich-text core, the same way as its rich-text editor, so a host adds its own types and refines built-in ones without forking the schema. It reads no DOM when it is built, so a server builds the same schema as the editor.

## DOCE-SCHEMA-1 - Assembly

### DOCE-SCHEMA-1.1 - One schema on every side

`createDocumentSchema(options)` shall build the schema from the built-in extensions (`createDocumentSchemaExtensions`) followed by the host's own, and `createDocumentKit(options)` shall return the kit with the schema, plugins and views of every extension. The node types shall sit in the order `DOCUMENT_NODE_ORDER` gives and the marks in the order `DOCUMENT_MARK_ORDER` gives, since parsers try node types in that order and marks nest in it. Building the schema shall not need a DOM, so a server reads and checks the documents the editor writes; the model is published as the `model` entry point.

Implementation: `src/model/schema/document-schema.ts`, `src/model/schema/node-order.ts`, `src/model/index.ts`
Verification: `src/model/schema/document-schema.test.ts`, `src/model/schema/document-schema-node.test.ts`

### DOCE-SCHEMA-1.2 - Host types at free ordinals

Built-in ordinals step by ten. A host extension shall place its own node and mark types at the free ordinals, and they shall take their place among the built-in types in the schema and in parsing.

Implementation: `src/model/schema/node-order.ts`, `src/model/schema/document-schema.ts`
Verification: `src/model/schema/document-schema.test.ts`

### DOCE-SCHEMA-1.3 - Host refinements

Every node type, a host's included, shall carry the element attributes (DOCE-SCHEMA-2). A host extension's `refineNode` and `refineMark` shall run after the built-in refinements, so a host adds attributes, parse rules or output of its own to a built-in type, such as an attribute of tables, and its refinement sees the element attributes.

Implementation: `src/model/schema/element-attributes.ts`, `src/model/schema/document-schema.ts`
Verification: `src/model/schema/document-schema.test.ts`

### DOCE-SCHEMA-1.4 - Host presentation

`DocumentSchemaOptions` shall hold the host's choices for the rendered output: `tooltipAttribute`, the attribute a tooltip text is written to and read from before `title` (default `title`); `mentionClass`, the class of a rendered mention (default `de-mention`); `headerPlaceholder` and `footerPlaceholder`, the text a page header or footer holds until its template sets one; `assetPreviewUrl(fileAssetId, snapshotId)`, the address a stored asset is previewed at (default none); and `referenceTypes`, the host's own external reference types, whose references write their format key (DOCE-SCHEMA-4.1).

Implementation: `src/model/schema/schema-options.ts`, `src/model/schema/marks.ts`, `src/model/schema/inline-atom-nodes.ts`, `src/model/schema/reference-mark.ts`
Verification: `src/model/schema/document-schema.test.ts`, `src/model/schema/page-nodes.test.ts`, `src/model/schema/figure-nodes.test.ts`, `src/model/schema/marks.test.ts`

## DOCE-SCHEMA-2 - Element attributes

### DOCE-SCHEMA-2.1 - Identity, authorship and splits

Every node type but text shall carry `dataId` (`data-id`), `dataAuthor` (`data-au`), `dataAiSession` (`data-ai`) and `splitPartIndex` (`data-split-part-index`), read from and written to its element. Paragraphs shall also carry `paragraphLevel`; paragraphs, headings, figures and layout sections the suggestion attributes (`data-suggestion-split-kind`, `data-suggestion-split-id`); and list items `orphanedListContinuation` (`data-orphaned-list-continuation`). An attribute without a value shall not be written.

Implementation: `src/model/schema/element-attributes.ts`, `src/model/schema/dom-attributes.ts`
Verification: `src/model/schema/element-attributes.test.ts`, `src/model/schema/document-schema-node.test.ts`

### DOCE-SCHEMA-2.2 - Paragraph levels

A paragraph level shall be an integer from 1 to 6; any other value shall read as 1, and a value above 6 as 6. A level above 1 shall be written as `data-paragraph-level`.

Implementation: `src/model/schema/element-attributes.ts`
Verification: `src/model/schema/element-attributes.test.ts`

### DOCE-SCHEMA-2.3 - Identity attributes

The attributes that say which element a node is, rather than how it looks, shall be declared on each node type as identity attributes (`IdentityAttribute`: `name`, `dom`, `scope`, `onCopy`), which `identityAttributesOf(type)` gives. The built-in ones are `dataId`, `dataAuthor`, `dataAiSession` and `splitPartIndex` on every type but text, and the suggestion split attributes on the types that carry them; a copy clears each of them. A host shall declare its own through `DocumentSchemaOptions.identityAttributes`, such as an element's review state: every type in its `scope` (every type but text when it names none) carries it, defaulting to null, reads it from and writes it to the `dom` attribute, and writes nothing when it is empty; a host attribute named as a built-in one shall be refused. `onCopy` says whether a pasted copy keeps the source's value (`keep`) or clears it (`clear`). `pickIdentityAttrs(type, attrs)` shall give a node's identity attributes, as a type change carries them over, and `clearIdentityAttrs(type, attrs)` its attributes with those a copy clears reset, as a new element's.

Implementation: `src/model/schema/element-attributes.ts`, `src/model/schema/schema-options.ts`
Verification: `src/model/schema/element-attributes.test.ts`

## DOCE-SCHEMA-3 - Stored markup

### DOCE-SCHEMA-3.1 - Pages and footnotes

A section (`div.pm-section`) shall hold pages, each a header, content, footnote area and footer in that order. A section shall keep its name, its CSS variables, its header and footer markup and whether it is editable; a locked section shall be written as not editable. A page header or footer shall keep its template markup and hold the placeholder when it is empty, unless its section's markup is explicitly empty. A footnote marker (`sup[data-footnote-id]`) shall read before the superscript mark and pair by id with its entry in the page's footnote area; both shall write the number, the entry as a separate number before its content. A manual page break shall be `hr[data-page-break="manual"]`.

Implementation: `src/model/schema/page-nodes.ts`, `src/model/schema/footnote-nodes.ts`
Verification: `src/model/schema/page-nodes.test.ts`

### DOCE-SCHEMA-3.2 - Template blocks and variables

A template block (`div[data-dynamic-template]`) shall keep its template markup, its rendered markup and the keys it tracks. A template variable (`span[data-template-variable]`) shall hold its value as plain text without marks and keep its key.

Implementation: `src/model/schema/template-nodes.ts`
Verification: `src/model/schema/page-nodes.test.ts`

### DOCE-SCHEMA-3.3 - Figures and images

A figure shall keep its type (`image` or `diagram`), caption, whether the caption shows, size and alignment, and write the size and alignment on its image so the caption spans the content width. An uploaded or pasted figure shall store its asset and snapshot ids and no address: the address it was written with is only a preview, and the host's `assetPreviewUrl` gives the one it shows. A diagram without a stored rendering shall show a placeholder image. An inline image shall keep its address, text and tooltip. An image a template places from its own files (`templateFile:<file>:<snapshot>` or the template image attributes) shall render in a wrapper that aligns it, at its stored size or 160 by 96 pixels. It shall be stored by its asset and snapshot and never by an address, and render at the address the host's `assetPreviewUrl(file, snapshot, { asOf })` gives, where `asOf` is the time the host shows the document's assets as of (`assetsAsOf`, null for now); without an address its wrapper shall carry `data-image-missing="true"` so the host can style an image that was not found. `templateImageRefs(template)` shall list the assets a template's content shows (its own and its sections' headers, footers, content and placeholders), each once, and `templateImageErrors(template)` shall name every image there stored by an address or without an asset.

Implementation: `src/model/schema/figure-nodes.ts`, `src/model/schema/image-node.ts`, `src/model/schema/object-layout.ts`, `src/model/schema/schema-options.ts`, `src/model/templates/template-content.ts`
Verification: `src/model/schema/figure-nodes.test.ts`, `src/model/schema/image-node.test.ts`

### DOCE-SCHEMA-3.4 - Code and math

A code block shall keep its language (default `plaintext`), caption, whether the caption shows, whether it continues a block pagination split, and the number of its first line, and write its caption in a caption line before the code. A linked code block shall keep its address, language, code and first line, and take its caption from the address's file name. Inline and display math shall hold their LaTeX as text without marks and write it as the content attribute too.

Implementation: `src/model/schema/code-nodes.ts`, `src/model/schema/math-nodes.ts`, `src/model/schema/caption-text.ts`
Verification: `src/model/schema/code-nodes.test.ts`

### DOCE-SCHEMA-3.5 - Tables

A table shall read its header, body and footer rows, or rows placed directly in it, as one body. It shall keep its border class, alignment, caption, whether the caption shows, and its caption's id; a table whose caption shows shall write its caption line (`doc-caption-line`, with `data-caption-kind="table"`), its text and an empty continued suffix the stylesheet fills on a later part of a split table, ahead of its rows; every table shall write a column group of its first row's columns: an aligned table sizes each column, and an unaligned one sizes the columns that have a width and takes their total width once every column has one. A cell shall keep its span, column widths, alignment, row height and colours, with colours stripped of characters that would end a style. A new cell, row or column shall start with an empty paragraph.

Implementation: `src/model/schema/table-nodes.ts`, `src/model/schema/object-layout.ts`
Verification: `src/model/schema/table-nodes.test.ts`

### DOCE-SCHEMA-3.6 - Layouts and tables of contents

A layout section shall sit only at the top level, outside the block group, and hold columns of block content; it shall keep its preset, a well-formed preset it does not know included, and read a malformed one as the default. A new column shall start with an empty paragraph. A table of contents shall keep its kind, deepest level, reference filter, entry range and whether it shows its title.

Implementation: `src/model/schema/block-layout-nodes.ts`, `src/model/schema/layout-presets.ts`
Verification: `src/model/schema/block-layout-nodes.test.ts`

### DOCE-SCHEMA-3.7 - Mentions, glossary references and signatures

A mention shall render `@` and its label, or its id when it has no label, with the mention attributes `mentionPresentation` gives. A glossary reference shall render its entry in full (`expansion (abbreviation)`) or short, as a link to the entry with the entry as its tooltip. A signature shall keep who signed, their name and the signed revision, and inline its vector only once signed; a vector that is not canonical shall read as none. A signature shall not be draggable.

Implementation: `src/model/schema/inline-atom-nodes.ts`, `src/model/glossary.ts`, `src/model/signature-vector.ts`
Verification: `src/model/schema/inline-atom-nodes.test.ts`

### DOCE-SCHEMA-3.8 - Marks

Links shall keep whether they open elsewhere and who wrote them; links and inline code shall keep their id and author. The contributor mark (`span[data-au]`) shall record who wrote a span. Strike, underline, superscript and subscript shall read from their tags, and strike and underline from text decoration too. A `del` or `ins` with an id or comment id shall read as a suggested deletion or insertion, keeping its id, its author (`data-au`) and its comment thread, and any other `del` as strike; a `mark` with a comment id shall read as a comment highlight, which does not extend as one types. A reference shall keep its type, target, the citation data it recorded and whether it is broken, and write its format key (DOCE-SCHEMA-4.1) for templates to style.

Implementation: `src/model/schema/marks.ts`, `src/model/schema/reference-mark.ts`
Verification: `src/model/schema/marks.test.ts`

### DOCE-SCHEMA-3.9 - Script blocks

A script block (`section[data-block-type="scripted-content"]`) shall keep its script (`data-script`), its refresh policy, `manual` or `open` (`data-refresh-policy`), and when its output was produced (`data-rendered-at`), and hold the blocks its script produced last in its output (`.script-output`). It is stored as a `script` node, with `source`, `refresh` and `renderedAt`.

Implementation: `src/model/schema/script-nodes.ts`, `src/model/format/document-format.ts`
Verification: `src/model/schema/script-nodes.test.ts`

## DOCE-SCHEMA-4 - References

### DOCE-SCHEMA-4.1 - Format keys

The format keys shall be `internal-<kind>` for each target kind (`heading`, `figure`, `table`, `codeblock`, `equation`), and for `external-document` and each host reference type, the type alone and `<type>-<kind>` for each kind. A saved reference's key shall be its type refined by its recorded target's kind, or its type alone when the refined key is not a format key, and none when neither is.

Implementation: `src/model/reference-format.ts`
Verification: `src/model/reference-format.test.ts`, `src/model/schema/marks.test.ts`

### DOCE-SCHEMA-4.2 - Recorded citation data

`readReferenceBaseline` shall read the citation data a reference recorded, from an object or JSON text, and return none for anything that is not version 1 with its text fields and, when present, a complete target. A recorded revision without a major part shall read as none.

Implementation: `src/model/reference-format.ts`
Verification: `src/model/reference-format.test.ts`

### DOCE-SCHEMA-4.3 - Formatted references

`formatReference` shall fill the template's format for the reference's key with `ref.numbering`, `ref.title`, `ref.revision`, `doc.numbering` and `doc.title`, showing the revision only when asked, and return text, never markup. A missing, empty or invalid format shall give the fallback, by default the citation's default label. `referenceFormatError` shall reject a format that is not text, longer than 2,000 characters or using another token.

Implementation: `src/model/reference-format.ts`
Verification: `src/model/reference-format.test.ts`

## DOCE-SCHEMA-5 - Mark order

### DOCE-SCHEMA-5.1 - Canonical order of overlapping marks

Marks of a type that does not exclude itself (`overlapsItself`: comment highlights, suggested insertions and suggested deletions) may sit on one run several times, and ProseMirror keeps them in the order they were added. They shall have one canonical order instead, so two people who add the same marks in another order hold equal documents (`doc.eq`): a run's marks are sorted by type rank, and marks of one such type by `dataId`, then `commentId`, then their other attributes (`compareMarks`). `orderMarks` shall put a mark set in that order, returning the same array when it already is; `orderDocumentMarks` shall put every run of a document in that order and join the runs that then match, returning the same node when nothing changed; `addMarkInOrder(tr, from, to, mark)` shall add a mark so the runs it covers stay in that order, and add a mark of any other type as `addMark` does. Every engine command that adds such a mark adds it with `addMarkInOrder`, and a collaboration binding builds mark sets with `orderMarks` rather than normalizing documents.

Implementation: `src/model/schema/mark-order.ts`
Verification: `src/model/schema/mark-order.test.ts`

## DOCE-SCHEMA-6 - Document structure

### DOCE-SCHEMA-6.1 - Sections

`documentSections(doc)` shall list a document's sections in order, each with its node, where it starts, its index from 0 and its template section's name. `isStructureNode` shall tell the nodes around the content (sections, pages and regions) from content, and `regionKind` shall name a region: `header`, `content`, `footnotes` or `footer`. Code outside the pagination shall read sections and regions through these functions, never by walking pages, so it reads a paged document and the canonical whole document alike.

Implementation: `src/model/schema/document-structure.ts`
Verification: `src/model/schema/document-structure.test.ts`

### DOCE-SCHEMA-6.2 - Regions

`sectionRegions(section, kinds)` and `documentRegions(doc, kinds)` shall list the regions of a section or of the document in order, of the kinds given or of every kind, each with its node, where it starts and its section: the regions of every page in a paged document, and each section's regions once in the canonical document.

Implementation: `src/model/schema/document-structure.ts`
Verification: `src/model/schema/document-structure.test.ts`

### DOCE-SCHEMA-6.3 - The region at a position

`regionAt($pos)` shall give the region holding a position, with its kind, node, start, depth and section, and `sectionAt($pos)` the section holding it; each shall give null outside one.

Implementation: `src/model/schema/document-structure.ts`
Verification: `src/model/schema/document-structure.test.ts`
