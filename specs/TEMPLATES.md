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

`BASE_TEMPLATE` shall be a valid template that sets every page and style setting a document needs: portrait A4 pages with 25.4mm margins, paragraph, title and heading styles, numbering for headings, paragraphs and captioned objects, and list, table, figure, code block, equation, contents, footnote and change bar settings. A host stores it, or a base of its own, as the base template every template inherits (DOCE-FORMAT-3.2).

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

`buildFootnoteCssVarEntries(settings, fontStacks)` shall set the `--doc-footnote-*` custom properties of the suffix (an escaped CSS string), the separator border, the spacings, and the marker and text typography, each with its default.

Implementation: `src/model/templates/template-scopes.ts`
Verification: `src/model/templates/template-scopes.test.ts`

### DOCE-TEMPLATES-3.3 - Caption properties

`buildCaptionCssVarEntries(styles, fontStacks)` shall set the caption label and text font family, size, weight and style of tables, figures and code blocks (`--doc-<kind>-caption-<label|text>-font-*`, kind `table`, `figure` or `code`) and the table caption alignment (`--doc-table-caption-text-align`). An unset value shall be null, so a section inherits the document's and a caption falls back from label to text to paragraph.

Implementation: `src/model/templates/template-scopes.ts`
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
