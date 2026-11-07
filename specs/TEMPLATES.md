# Templates

A template sets a document's pages, typography, numbering, footnotes and required sections. The model reads a template's stored settings, merges a child template over its parent and turns the result into the CSS values and custom properties the document's stylesheet uses, so the editor, a preview and an export lay out the same page. Stored templates are a compatibility contract. The model reads no DOM, so a server resolves the same template. A host serves its own fonts by passing the font stacks it hosts.

## DOCE-TEMPLATES-1 - CSS values

### DOCE-TEMPLATES-1.1 - Pages and margins

`PAGE_SIZE_DIMENSIONS` shall give the width and height of each ISO A size and US size a template may name. A bare margin number shall be in millimetres for an ISO page size and inches otherwise (`resolveTemplateMarginUnit`). `parseMarginToCssPx` shall read a bare number in that unit, or a length in `mm`, `in`, `pt` or `px`, as non-negative CSS pixels, and return null for anything else.

Implementation: `src/model/templates/template-css-values.ts`
Verification: `src/model/templates/template-css-values.test.ts`

### DOCE-TEMPLATES-1.2 - Sizes and texts

A size shall keep its unit as written, a bare number being pixels; a text value shall be trimmed; display text shall be kept as written; each takes its fallback when blank. A text style's line height shall be `lineHeight`, else `lineSpacing`, an empty `lineHeight` counting as unset.

Implementation: `src/model/templates/template-css-values.ts`
Verification: `src/model/templates/template-css-values.test.ts`

### DOCE-TEMPLATES-1.3 - Font stacks

`resolveTemplateFontFamilyCssText(font, fallback, fontStacks)` shall write a template font as a font stack that is safe inside a style element: quotes, braces, angle brackets, semicolons and control characters removed, generic families in lower case, bare identifiers unquoted and other names quoted. A family the host serves shall be written as the stack `fontStacks` names for it.

Implementation: `src/model/templates/template-css-values.ts`
Verification: `src/model/templates/template-css-values.test.ts`

## DOCE-TEMPLATES-2 - Metrics and inheritance

### DOCE-TEMPLATES-2.1 - Defaults

A template without its own settings shall take `DOCUMENT_TEMPLATE_PAGE_METRIC_FALLBACK`: portrait A4 pages with 25.4mm margins and default paragraph, heading, title, list, code block and table styles.

Implementation: `src/model/templates/template-metrics.ts`
Verification: `src/model/templates/template-metrics.test.ts`

### DOCE-TEMPLATES-2.2 - Child templates

`mergeDocumentTemplateMetricDefaults(parent, child)` shall merge a child template's settings over its parent's deeply into a copy: an unset or blank child value takes the parent's, an array replaces the parent's whole, and anything else the child sets wins. A paragraph style's empty format shall be kept, since it switches numbering off.

Implementation: `src/model/templates/template-metrics.ts`
Verification: `src/model/templates/template-metrics.test.ts`

### DOCE-TEMPLATES-2.3 - Numbering restarts

Heading and paragraph counters shall restart where a template section starts when it sets `restartHeadingNumbering`, or, without it, when the section sets its own paragraph or heading styles (`templateSectionRestartsHeadingNumbering`).

Implementation: `src/model/templates/template-metrics.ts`
Verification: `src/model/templates/template-metrics.test.ts`

### DOCE-TEMPLATES-2.4 - Page region spacing

The spacing between a page header or footer and the content shall be the document section's, then the template's entry for the section, then the template's, each read from the region's `spacingToContent` or the scope's `<region>SpacingToContent`, skipping a scope whose region asks to inherit (`inherit: true`). It shall be in CSS pixels, or null when no scope sets it.

Implementation: `src/model/templates/template-metrics.ts`
Verification: `src/model/templates/template-metrics.test.ts`

## DOCE-TEMPLATES-3 - Footnotes and captions

### DOCE-TEMPLATES-3.1 - Footnote settings

`resolveMergedTemplateFootnoteSettings(template, section, templateSection)` shall merge the section's footnote settings (the document's section, else the template's entry) over the template's, with defaults: numbering per document, no suffix, a 1px separator line, 12pt spacing to the content and 6pt between entries. The numbering mode shall be the template's alone. A separator of `none` or one switched off shall not be drawn.

Implementation: `src/model/templates/template-metrics.ts`
Verification: `src/model/templates/template-metrics.test.ts`, `src/model/templates/template-footnotes-captions.test.ts`

### DOCE-TEMPLATES-3.2 - Footnote properties

`buildTemplateFootnoteCssVarEntries(settings, fontStacks)` shall set the `--doc-footnote-*` custom properties of the numbering suffix (an escaped CSS string), the separator border, the spacings, and the marker and text typography, each with its default.

Implementation: `src/model/templates/template-metrics.ts`
Verification: `src/model/templates/template-footnotes-captions.test.ts`

### DOCE-TEMPLATES-3.3 - Caption properties

`buildTemplateCaptionCssVarEntries(styles, fontStacks)` shall set the caption label and text font family, size, weight and style of tables, figures and code blocks (`--doc-<kind>-caption-<label|text>-font-*`, kind `table`, `figure` or `code`) and the table caption alignment (`--doc-table-caption-text-align`: `left`, `center` or `right`). An unset value shall be null, so a section inherits the document's and a caption falls back from label to text to paragraph.

Implementation: `src/model/templates/template-metrics.ts`
Verification: `src/model/templates/template-footnotes-captions.test.ts`

## DOCE-TEMPLATES-4 - Sections

### DOCE-TEMPLATES-4.1 - Section names

Section names shall be compared without case or surrounding space (`normalizeTemplateSectionName`, `findSectionByName`).

Implementation: `src/model/templates/template-sections.ts`
Verification: `src/model/templates/template-sections.test.ts`

### DOCE-TEMPLATES-4.2 - Required sections

`resolveRequiredTemplateSections(template)` shall return the sections a document must have: a section that is required, or that does not say and is named by the template's older minimum content list, whose settings it takes under its own; and a section only that list names.

Implementation: `src/model/templates/template-sections.ts`
Verification: `src/model/templates/template-sections.test.ts`

### DOCE-TEMPLATES-4.3 - Structural variables

`resolveDocumentStructuralVariables(markup)` shall replace each structural variable in a template's markup with its generated list block (`data-toc-block`, `data-toc-type`): `table_of_content` (`toc`), `table_of_figures`, `table_of_tables`, `table_of_equations`, `table_of_code_blocks` (`codeBlocks`), `table_of_references`, and `table_of_abbreviations`, `acronyms_and_abbreviations` and `acronyms` (`acronyms`). Any other variable shall be kept as written.

Implementation: `src/model/templates/template-sections.ts`
Verification: `src/model/templates/template-sections.test.ts`
