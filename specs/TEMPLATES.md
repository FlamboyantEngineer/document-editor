# Templates

A template sets a document's pages, typography, numbering, footnotes and sections. Templates are stored in the template format (DOCE-FORMAT-2) and merge over the templates they inherit (DOCE-FORMAT-3). The model turns a resolved template's settings into the CSS values and custom properties the document's stylesheet uses, so the editor, a preview and an export lay out the same page. It reads no DOM, so a server resolves the same template. A host serves its own fonts by passing the font stacks it hosts.

## DOCE-TEMPLATES-1 - CSS values

### DOCE-TEMPLATES-1.1 - Pages and lengths

`PAGE_SIZE_DIMENSIONS` shall give the width and height of each ISO A size and US size a template may name. `lengthToCssPx(length)` shall read an absolute length in `px`, `pt`, `in`, `mm` or `cm` as non-negative CSS pixels, and return null for a relative length or anything that is not a length.

Implementation: `src/model/templates/template-css-values.ts`
Verification: `src/model/templates/template-css-values.test.ts`

### DOCE-TEMPLATES-1.2 - Font stacks

`resolveFontStack(font, fallback, fontStacks)` shall write a template font as a font stack that is safe inside a style element: quotes, braces, angle brackets, semicolons and control characters removed, generic families in lower case, bare identifiers unquoted and other names quoted, or the fallback when it names none. A family the host serves shall be written as the stack `fontStacks` names for it.

Implementation: `src/model/templates/template-css-values.ts`
Verification: `src/model/templates/template-css-values.test.ts`

## DOCE-TEMPLATES-2 - Scopes

### DOCE-TEMPLATES-2.1 - Base template

`BASE_TEMPLATE` shall be a valid template that sets every page and style setting a document needs: portrait A4 pages with 25.4mm margins, paragraph, title and heading styles, numbering for headings and captioned objects, paragraph numbering defined but switched off (`enabled: false`), and list, table, figure, code block, equation, contents, footnote and change bar settings. A host stores it, or a base of its own, as the base template every template inherits (DOCE-FORMAT-3.2).

Implementation: `src/model/templates/base-template.ts`
Verification: `src/model/templates/template-scopes.test.ts`

### DOCE-TEMPLATES-2.2 - Numbering restarts

Heading and paragraph counters shall restart where a template section starts when it sets `restartNumbering`, or, without it, when the section sets its own paragraph or heading styles (`sectionRestartsNumbering`).

Implementation: `src/model/templates/template-scopes.ts`
Verification: `src/model/templates/template-scopes.test.ts`

### DOCE-TEMPLATES-2.3 - Page region spacing

`resolveRegionSpacing(template, section, region)` shall give the space between a section's page header or footer and its content, in CSS pixels, from the region the section uses (DOCE-FORMAT-3.4), or null when it sets none.

Implementation: `src/model/templates/template-scopes.ts`
Verification: `src/model/templates/template-scopes.test.ts`

## DOCE-TEMPLATES-3 - Footnotes and captions

### DOCE-TEMPLATES-3.1 - Footnote settings

`resolveFootnoteSettings(template, section)` shall merge a section's footnote settings over the template's, with defaults for what neither sets: numbering through the document, no suffix, a 1px separator line, 12pt spacing to the content and 6pt between entries. The numbering shall be the template's alone.

Implementation: `src/model/templates/template-scopes.ts`
Verification: `src/model/templates/template-scopes.test.ts`

### DOCE-TEMPLATES-3.2 - Footnote properties

`buildFootnoteCssVarEntries(settings, fontStacks)` shall set the `--doc-footnote-*` custom properties of the suffix (an escaped CSS string), the separator border, the spacings, and the marker and text typography, each with its default, which a value that is not of its setting's kind (DOCE-TEMPLATES-5.2) takes too.

Implementation: `src/model/templates/template-scopes.ts`, `src/model/templates/template-property-values.ts`
Verification: `src/model/templates/template-scopes.test.ts`

### DOCE-TEMPLATES-3.3 - Caption properties

`buildCaptionCssVarEntries(styles, fontStacks)` shall set the caption label and text font family, size, weight and style of tables, figures and code blocks (`--doc-<kind>-caption-<label|text>-font-*`, kind `table`, `figure` or `code`) the table caption alignment (`--doc-table-caption-text-align`), and the text after the caption of a later part of a split object (`--doc-<kind>-caption-continued`, as CSS content, without a leading dash). An unset value, or one that is not of its setting's kind (DOCE-TEMPLATES-5.2), shall be null, so a section inherits the document's and a caption falls back from label to text to paragraph.

Implementation: `src/model/templates/template-scopes.ts`, `src/model/templates/template-property-values.ts`
Verification: `src/model/templates/template-scopes.test.ts`

## DOCE-TEMPLATES-4 - Sections

### DOCE-TEMPLATES-4.1 - Section names

`findTemplateSection(template, name)` shall find a template's section by its name.

Implementation: `src/model/templates/template-sections.ts`
Verification: `src/model/templates/template-sections.test.ts`

### DOCE-TEMPLATES-4.2 - Required sections

`requiredTemplateSections(template)` shall list the sections every document of the template has, in order.

Implementation: `src/model/templates/template-sections.ts`
Verification: `src/model/templates/template-sections.test.ts`

## DOCE-TEMPLATES-5 - Template properties

### DOCE-TEMPLATES-5.1 - Page metrics

`templatePageMetrics(template, section)` shall give a scope's page width, height and margins in CSS pixels, with width and height swapped for a landscape page. A section's page settings shall apply over the template's, and an unknown page size shall measure nothing.

Implementation: `src/model/templates/template-properties.ts`
Verification: `src/model/templates/template-properties.test.ts`

### DOCE-TEMPLATES-5.2 - Style properties

`templateProperties(template, { section, fontStacks })` shall write a scope's page size and margins, its text styles (font, size, weight, style, decoration, color, line height, alignment and spacing), its list, table, code block and contents settings (DOCE-TEMPLATES-10.5), its captions and its footnotes as `--doc-*` custom properties. A setting no scope sets shall be left out, so the stylesheet's fallback applies. The properties are joined into `style` attributes and a style element, and a template a host loads may not have been validated, so a value that is not of its setting's kind, as validation knows it (DOCE-FORMAT-2.2: a length, a hex color, a font weight, a line height, an alignment), shall be left out too, and text that is not such a value never reaches a style.

Implementation: `src/model/templates/template-properties.ts`, `src/model/templates/template-text-properties.ts`, `src/model/templates/template-property-values.ts`
Verification: `src/model/templates/template-properties.test.ts`

### DOCE-TEMPLATES-5.3 - Numbering properties

`templateProperties` shall write each heading level's numbering as CSS counter content with an enabled flag, each figure, table, code block and equation number as counter content, and, for each heading level that restarts object numbers, the counters it sets (`--doc-h<level>-counter-set-extra`). An equation's number shall sit inside its wrapper once.

Implementation: `src/model/templates/template-properties.ts`
Verification: `src/model/templates/template-properties.test.ts`

### DOCE-TEMPLATES-5.4 - Section scopes

`templateProperties` with a section shall apply the section's styles, page and footnote settings over the template's, so a host sets them on that section.

Implementation: `src/model/templates/template-properties.ts`
Verification: `src/model/templates/template-properties.test.ts`

### DOCE-TEMPLATES-5.5 - Styled pages

A document whose root carries a template's properties, styled by the reference stylesheet, shall show pages of the template's size whose content fits inside its margins, with headings numbered in the template's format.

Implementation: `labs/reference/document.css`, `labs/src/templates.lab.ts`
Verification: `e2e/templates.spec.ts`

### DOCE-TEMPLATES-5.6 - Switching templates

Setting another template's properties and refreshing the pagination with `remeasure` shall restyle the document and lay it out again on pages of the new template's size.

Implementation: `labs/src/templates.lab.ts`
Verification: `e2e/templates.spec.ts`

### DOCE-TEMPLATES-5.7 - Root templates

A template resolved without a base template (`baseTemplateId: null`) shall set only what it sets: a blank heading numbering shall number nothing, and pixel margins shall be written as they are.

Implementation: `src/model/templates/template-properties.ts`, `src/model/format/template-format-resolve.ts`
Verification: `src/model/templates/template-properties.test.ts`

### DOCE-TEMPLATES-5.8 - Change bar properties

`templateProperties` for the document shall write the template's change bars: each kind's color (`--doc-change-bar-<insertions|deletions|modifications|formatting>-color`), transparent for a disabled kind and left out when it is not a hex color, their width, and `--doc-change-bar-left` and `--doc-change-bar-right`, one placing a bar its offset outside a block on the template's side and the other `auto`. A section scope shall write none.

Implementation: `src/model/templates/template-properties.ts`
Verification: `src/model/templates/template-properties.test.ts`

### DOCE-TEMPLATES-5.9 - A section's change bars

A template section may set its own change bars (`changeBars`): `templateProperties` for its scope shall write them over the document's, merged setting by setting by the inheritance rule (DOCE-FORMAT-3.1), as a section's other settings are, so a section that sets only a kind's color keeps whether the document shows the kind, and the section's pages take them, and write none for a section without, which inherits the document's. The template editor edits them in a section's scope.

Implementation: `src/model/templates/template-properties.ts`, `src/model/format/template-format-shape.ts`, `src/components/template-editor/template-scope.tsx`
Verification: `src/model/templates/template-properties.test.ts`

## DOCE-TEMPLATES-6 - Page regions

### DOCE-TEMPLATES-6.1 - Header and footer content

`setPageRegions(tr, template, { editable, edits })` shall set every page's header and footer to its section's template region (DOCE-TEMPLATES-2.3 scopes: a section's own region, or the template's when it has none or inherits), or to the edit standing over it (DOCE-SECTIONS-5.1), read-only unless `editable`. A stored document shall never hold them. Setting regions that a document already holds shall change nothing. A region shall keep what it holds when it cannot hold its content, which cannot be read or which a page header or footer does not allow, such as a column layout (DOCE-FORMAT-2.4 reports it for a template): the regions are set in a transaction of their own, where a refusal would stop every edit.

Implementation: `src/model/templates/page-regions.ts`, `src/model/format/document-format-convert.ts`
Verification: `src/model/templates/page-regions.test.ts`

### DOCE-TEMPLATES-6.2 - A document section's own regions

A document section's own page header and footer (DOCE-FORMAT-1.6) shall apply over its template section's region by the same field-by-field rule (DOCE-FORMAT-3.4): its own content where it sets some, the template's where it sets none or asks to inherit.

Implementation: `src/model/templates/page-regions.ts`
Verification: `src/model/templates/page-regions.test.ts`

## DOCE-TEMPLATES-7 - Custom styles

### DOCE-TEMPLATES-7.1 - Applying a custom style

A template's custom styles (`styles.custom`, by name, `customStyleNames`) shall apply to paragraphs and headings by name (`setCustomStyle`, `customStyleAt`), kept as the block's style; `createCustomStyles({ template })`, which the editing plugins install when given the template, gives each block in a style the style's values from its section's template or the document's (`customStyleProperties`, `--doc-custom-*`, with `data-custom-style`), in every view, again when the template changes. A built-in text style takes a block out of its custom style. The toolbar's text style field offers the custom styles after the built-in ones. A block's style shall read from markup, and be written, as its `class` only when the class is one name a custom style may have (`CUSTOM_STYLE_NAME`): any other class, such as those markup pasted from a page carries, is not kept and not written, so a host's stylesheet never acts on it.

Implementation: `src/engine/custom-styles.ts`, `src/model/schema/core-nodes.ts`, `src/model/templates/template-text-properties.ts`, `src/components/document-editor/toolbar-controls.tsx`
Verification: `src/engine/custom-styles.test.ts`, `src/model/schema/core-nodes.test.ts`, `e2e/template-editor.spec.ts`

## DOCE-TEMPLATES-8 - Template content

### DOCE-TEMPLATES-8.1 - Tokens

A template's content (a section's starting content, its headers and footers) shall be read with each `{{key}}` token in its text a live variable of that key (DOCE-PAGINATION-8.3), and a paragraph that is only a list token a list of contents of its kind (`readTemplateContent`); drift is judged on content read so. The list tokens are `table_of_contents`, `list_of_figures`, `list_of_tables`, `list_of_code`, `list_of_equations`, `list_of_references` and `list_of_abbreviations` (`CONTENTS_TOKENS`), or the tokens a host gives in their place (`contentsTokens`, token to kind), such as for its own kinds of list. `{{key}}` is the only token form: other bracketings stay text. A token shall be read so only where its parent may hold what it stands for: in a code block or in math, which hold text only, it stays text, and a list token where no list of contents may stand, such as the first paragraph of a list item, is read as any other token, so content read from a template is always valid.

Implementation: `src/model/templates/template-content.ts`, `src/model/templates/page-regions.ts`, `src/engine/document-sections.ts`, `src/engine/template-sync.ts`
Verification: `src/model/templates/template-content.test.ts`

### DOCE-TEMPLATES-8.2 - Previewing a template

`templatePreviewDocument(template, text)` shall give a document, never stored, that shows what a resolved template looks like: its name as the title, a table of contents, every heading level with text, a footnote, a bulleted and a numbered list, a captioned table and code block and an equation, a paragraph in each custom style, then each template section with the content it starts with, else its placeholder, else its label and text.

Implementation: `src/model/templates/template-preview.ts`
Verification: `src/model/templates/template-preview.test.ts`, `e2e/template-editor.spec.ts`

### DOCE-TEMPLATES-8.3 - Typed tokens

`createVariableTokens()` shall turn a `{{key}}` token a writer types into a live variable of that key as soon as its closing braces are typed, wherever the schema allows a variable. Text in code, other bracketings and an unclosed token shall stay as typed.

Implementation: `src/engine/variable-tokens.ts`
Verification: `src/engine/variable-tokens.test.ts`

### DOCE-TEMPLATES-8.4 - Variable catalog

`variableCatalog(label, host)` shall list the variables a writer may insert: the editor's own (`EDITOR_VARIABLES`: `page.current`, `page.total` and `date.current`), each named by `label`, then the host's (`catalog` of its `variables` adapter, DOCE-HOST-1.12) in its order, leaving out a key listed before.

Implementation: `src/engine/template-variables.ts`
Verification: `src/engine/template-variables.test.ts`

### DOCE-TEMPLATES-8.5 - Inserting a variable

`insertVariable(key)` shall put a live variable of the key in place of the selection, the caret after it, and refuse a key a `{{key}}` token cannot hold, a selection in code or across blocks, and a place the schema allows no variable. The toolbar's variable menu (`variable`, in the insert group, so also in the menubar's Insert menu) shall list the catalog, labelled by `editorVariables` and the host, each entry inserting its variable, while the host lists variables or the template's content is edited in place (`onRegionChange`).

Implementation: `src/engine/template-variables.ts`, `src/components/document-editor/variable-menu.ts`, `src/components/document-editor/insert-controls.tsx`
Verification: `src/engine/template-variables.test.ts`, `src/components/document-editor/variable-menu.test.tsx`, `e2e/template-content.spec.ts`

### DOCE-TEMPLATES-8.6 - A preview in parts

`templatePreviewDocument(template, text, { parts: true })` shall show each template section as two sections of its name, its starting content and then its placeholder, each an empty paragraph while the template has none, for editing them in place (DOCE-SECTIONS-5.2); `templatePartSections(doc)` shall list them, the first section of a name its content and the second its placeholder. `withTemplatePart(template, change, resolved)` shall write a part into the template's section of that name, leaving the part out when it is one empty paragraph, a template that inherits its sections taking the resolved ones as its own first, and leave a template without that section as it is. `withEditableSections(template)` shall give the template with no section locked (`editable` left out), for the editing plugins and the editor over such a preview, so a section the template locks in documents is edited there too.

Implementation: `src/model/templates/template-preview.ts`
Verification: `src/model/templates/template-preview.test.ts`

## DOCE-TEMPLATES-9 - Template blocks

### DOCE-TEMPLATES-9.1 - Rendering a template block

`createDynamicTemplates({ value })` shall render each template block (`dynamic_template`) from its markup, with each `{{key}}` token in its text replaced by the variable's value (`value`, and `date.current` as page variables write it), in every view it runs in, as a block the writer cannot edit inside. It shall render it again when its markup changes, and, after `refreshDynamicTemplates(tr)`, outside the undo history, when a value it tracks changes, giving the block a measure key (`data-de-measure-key`) of its markup and values so the pages measure it again. Rendering shall never change the document. `DocumentEditor` shall install it with the host's `variables` adapter and refresh it when the adapter says a value changed (DOCE-PAGINATION-8.4).

Implementation: `src/engine/dynamic-templates.ts`, `src/components/document-editor/use-document-layout.ts`
Verification: `src/engine/dynamic-templates.test.ts`

### DOCE-TEMPLATES-9.2 - Safe markup

A template block's markup shall be read in an inert document and then as the schema reads markup (`renderTemplateBlock`), so only the document's own nodes and attributes render and no script, handler or frame in it runs or loads; values shall be inserted as text, never as markup.

Implementation: `src/engine/dynamic-templates.ts`
Verification: `src/engine/dynamic-templates.test.ts`

### DOCE-TEMPLATES-9.3 - Tracked keys

A template block shall track the keys it names (`trackedKeys`, separated by commas or spaces), else the keys of the tokens in its markup (`templateBlockKeys`).

Implementation: `src/engine/dynamic-templates.ts`
Verification: `src/engine/dynamic-templates.test.ts`

## DOCE-TEMPLATES-10 - Template settings

### DOCE-TEMPLATES-10.1 - Numbering formats

`validateTemplateFile` shall accept a numbering format (`isNumberingFormat`) of up to six levels, each `1`, `a`, `A`, `i` or `I` followed by its separators (`.`, `-`, `:`, `_`, `/`, `)` and space), or an empty format, wherever a heading, paragraph, paragraph level, list or object sets one, and report any other value. A numbering `enabled` setting shall be true or false.

Implementation: `src/model/format/template-format-validate.ts`, `src/model/format/template-format-shape.ts`
Verification: `src/model/format/template-format.test.ts`

### DOCE-TEMPLATES-10.2 - Bullets

A list's `bullet` shall be a marker keyword (`disc`, `circle`, `square`, `none`) or up to 8 characters of text without control or formatting characters (`isTemplateBullet`), and `validateTemplateFile` shall report any other. `templateProperties` shall write a keyword as the list style and text as an escaped CSS string followed by a space (DOCE-NUMBERING-2.4), so a bullet can never close the style element.

Implementation: `src/model/format/template-format-validate.ts`, `src/model/templates/template-text-properties.ts`, `src/components/template-editor/template-settings.ts`
Verification: `src/model/format/template-format.test.ts`, `src/model/templates/template-properties.test.ts`

### DOCE-TEMPLATES-10.3 - Custom style names

A custom style's name shall start with a letter, then up to 15 letters, digits, underscores or hyphens (`CUSTOM_STYLE_NAME`). `validateTemplateFile` shall report each custom style of the template's or a section's styles named otherwise, and the template editor shall rename a style only to such a name.

Implementation: `src/model/format/template-format-validate.ts`, `src/components/template-editor/style-sections.tsx`
Verification: `src/model/format/template-format.test.ts`

### DOCE-TEMPLATES-10.4 - Lists of contents per kind

A template's contents settings shall hold, beside the lists' fonts, padding and spacing, a `leader` (`{ character, spacing }`), `levels` with their own indentation, spacing and leader, and `kinds`: each kind of list's own `title`, leader character and levels' leader characters, by the kind's key (`toc`, `figures` and the host's kinds). `resolveContentsList(contents, kind)` shall give a kind its title, or null, and its six levels, each with its leader character resolved from the least to the most specific of the lists' leader, their level's, the kind's and the kind's level's; an empty character shall draw no leader and none set shall draw `.`. A list of contents (DOCE-CONTENTS-2.1) shall show the template's title for its kind over the editor's label and draw each entry's leader with its level's character.

Implementation: `src/model/templates/template-settings.ts`, `src/model/format/template-format.ts`, `src/engine/contents.ts`
Verification: `src/model/templates/template-settings.test.ts`, `src/engine/contents.test.ts`

### DOCE-TEMPLATES-10.5 - Leaders and list numbers

`templateProperties` shall write the lists' leader character (`--doc-contents-leader`, an escaped string) and spacing (`--doc-contents-leader-spacing`), and each level's leader spacing it sets (`--doc-contents-level-<n>-leader-spacing`). A numbered list's counter content (`--doc-ol-counter-content`) shall print its `prefix`, its number in its format's first level, the level's separator and its `suffix`, each escaped.

Implementation: `src/model/templates/template-text-properties.ts`
Verification: `src/model/templates/template-properties.test.ts`

### DOCE-TEMPLATES-10.6 - Extension records

A host shall keep a keyed collection in `extensions` as a record, so a template inherits and overrides it entry by entry. `extensionRecord(template, name)` shall read such a record after inheritance, leaving out each entry set to `false`, which removes the entry a template inherits as null inherits it, and give an empty record for a missing or non-record value.

Implementation: `src/model/templates/template-settings.ts`
Verification: `src/model/format/template-format-resolve.test.ts`

### DOCE-TEMPLATES-10.7 - Missing settings

`missingTemplateSettings(template, base)` shall list, by path such as `styles.heading1.size`, each setting a full template sets (the base template's, or the host's `base`, apart from its identity and sections) that the template leaves absent or null, so a host can tell what a root template (DOCE-TEMPLATES-5.7) leaves to the stylesheet. A template resolved over the base shall miss none.

Implementation: `src/model/templates/template-settings.ts`
Verification: `src/model/format/template-format-resolve.test.ts`

### DOCE-TEMPLATES-10.8 - Template fixtures

The generic templates in `test/fixtures/templates/` shall be valid, resolve over the base template with no setting missing, give each scope its custom properties, and between them set every setting `TEMPLATE_SHAPE` knows.

Implementation: `test/fixtures/templates/`
Verification: `test/fixtures/templates/template-fixtures.test.ts`

### DOCE-TEMPLATES-10.9 - Template images

`validateTemplateFile` shall report each image in a template's or its sections' headers, footers, content and placeholders that is stored by an address or names no asset (`templateImageErrors`, DOCE-SCHEMA-3.3), once the template's settings are of the right shape.

Implementation: `src/model/format/template-format-validate.ts`
Verification: `src/model/format/template-format.test.ts`

## DOCE-TEMPLATES-11 - Template pinning

### DOCE-TEMPLATES-11.1 - Pinned revisions

A stored document's `template` shall be a `TemplatePin`: the template's `id` and, optionally, the host's `revision` of it, so the document, and each of its saved versions, renders with the template it pinned until an explicit update moves it to a newer revision. `writeDocumentFile(doc, { template })` shall write the pin as given, and `readDocumentFile` shall refuse a pin that is not an id with an optional text revision with a `DocumentFormatError` at `template`.

Implementation: `src/model/format/template-format.ts`, `src/model/format/document-format.ts`, `src/model/format/document-format-convert.ts`
Verification: `src/model/format/document-format.test.ts`, `test/fixtures/documents/regression-set.test.ts`

### DOCE-TEMPLATES-11.2 - Loading a pinned revision

`templates.load(id, { revision, signal })` shall give that revision of the stored template, or the latest without one, and a `not-found` error for a revision the store does not hold. The in-memory host shall keep each template it is given again under the same id as its next revision.

Implementation: `src/host/adapters.ts`, `src/host/memory-host.ts`
Verification: `src/host/memory-host.test.ts`
