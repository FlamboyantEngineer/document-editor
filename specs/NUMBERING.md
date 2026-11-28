# Numbering

A template numbers headings, paragraphs and captioned objects with numbering formats such as `1.1`, `a)` or `I-1`. Formats are stored in the template format (DOCE-FORMAT-2). The model turns a format into the CSS `content` and counter styles the document's stylesheet uses, so the editor, a preview and an export number the same way. The model reads no DOM, so a server builds the same numbering.

## DOCE-NUMBERING-1 - Formats

### DOCE-NUMBERING-1.1 - One level per character

`parseNumberingStyle(format)` shall read one level per letter or digit, with the text after it as that level's separator, so `11` and `IA` are two levels; the last separator is the format's trailing separator. An empty format shall read as `1`.

Implementation: `src/model/numbering/numbering-format.ts`
Verification: `src/model/numbering/numbering-format.test.ts`

### DOCE-NUMBERING-1.2 - Counter styles

A format character shall name its counter style: `i` and `I` lower and upper roman, any other lower-case or upper-case letter lower and upper alpha, and anything else decimal. Roman styles shall print with the library's own counter styles, `de-upper-roman` and `de-lower-roman` (`resolveCssCounterStyleToken`).

Implementation: `src/model/numbering/numbering-format.ts`
Verification: `src/model/numbering/numbering-format.test.ts`

### DOCE-NUMBERING-1.3 - Roman numerals

`formatRoman` shall write any positive safe integer in roman numerals, repeating `M` past 3999, and throw a `RangeError` for anything else. `parseRoman` shall read canonical subtractive numerals in one letter case and return null for anything else, such as `IIII` or mixed case.

Implementation: `src/model/numbering/numbering-format.ts`
Verification: `src/model/numbering/numbering-format.test.ts`

### DOCE-NUMBERING-1.4 - Counter text

`formatCounterValue(value, character)` shall print a counter in the character's style, alphabetic counters continuing `Z`, `AA`. A value below 1 or not an integer shall count as 1.

Implementation: `src/model/numbering/numbering-format.ts`
Verification: `src/model/numbering/numbering-format.test.ts`

### DOCE-NUMBERING-1.5 - Counter style rules

`DOCUMENT_COUNTER_STYLE_CSS` shall define every counter style the numbering content uses: the roman styles, without the browser's 3999 limit (`ROMAN_COUNTER_STYLE_CSS`), and the context styles that print a heading counter above 0 and nothing at 0 (`de-context-<style>`), with one separator style per separator they can leave out (`de-context-separator-<name>`, for `.`, `-`, `:`, `_`, `/`, space and `)`) (`OBJECT_CONTEXT_COUNTER_STYLE_CSS`). The reference stylesheet shall define each of them, so a caption reads `Table 1.1`, never the context levels' fallbacks run together.

Implementation: `src/model/numbering/numbering-format.ts`, `labs/reference/document.css`
Verification: `src/model/numbering/numbering-format.test.ts`

### DOCE-NUMBERING-1.6 - Section formats

A section's object styles shall merge over the document's by the template inheritance rule (DOCE-FORMAT-3.1, `mergeTemplateSettings`): a section's format replaces the document's, an empty format included, and what it leaves unset is the document's.

Implementation: `src/model/format/template-format-resolve.ts`
Verification: `src/model/numbering/numbering-format.test.ts`

## DOCE-NUMBERING-2 - Numbering content

### DOCE-NUMBERING-2.1 - Headings

`buildHeadingCounterContent(format, level, affixes)` shall print one counter per heading level down to the heading's own (`h1` to `h6`), each followed by its separator, then the trailing separator, the suffix and a space, after the prefix. A heading deeper than its format's levels shall not be numbered.

Implementation: `src/model/numbering/document-numbering.ts`
Verification: `src/model/numbering/document-numbering.test.ts`

### DOCE-NUMBERING-2.2 - Paragraphs

`buildParagraphCounterContent(format, affixes)` shall print the `paragraph` counter in the format's last level, then the trailing separator, the suffix and a space. A prefix that does not end in space shall be followed by the trailing separator. Without a format, a paragraph shall not be numbered.

Implementation: `src/model/numbering/document-numbering.ts`
Verification: `src/model/numbering/document-numbering.test.ts`

### DOCE-NUMBERING-2.3 - Captioned objects

`buildObjectCounterContent(format, counter, options)` shall count the headings an object sits under with its format's leading levels, each in its heading level's format character when `headingNumbering` gives one, and the object with the last. A context level no heading has opened shall print nothing, separator included, so a document without headings numbers `Table 1`; a separator no context style can leave out shall be printed as text. A caption label shall drop the trailing separator and space, since the caption adds its own.

Implementation: `src/model/numbering/document-numbering.ts`
Verification: `src/model/numbering/document-numbering.test.ts`

### DOCE-NUMBERING-2.4 - Escaped text

Authored text in numbering content shall be escaped for a double-quoted CSS string inside a style element (`escapeCssContent`): backslashes, quotes and line breaks, and `<` and `>`, so it can never close the element.

Implementation: `src/model/numbering/document-numbering.ts`
Verification: `src/model/numbering/document-numbering.test.ts`

### DOCE-NUMBERING-2.5 - Paragraph styles

`resolveParagraphNumberingConfig(settings)` shall read a paragraph style's numbering: its format, levels (a null level as an empty one), prefix and suffix. An empty or absent format, or `enabled: false`, shall switch numbering off.

Implementation: `src/model/numbering/document-numbering.ts`
Verification: `src/model/numbering/document-numbering.test.ts`

### DOCE-NUMBERING-2.6 - Numbering switch

A numbering setting's `enabled: false` shall read as an empty format for headings, paragraphs and captioned objects alike, while the stored format is kept, so switching it on again restores the numbering. Unset, the format decides.

Implementation: `src/model/templates/template-numbering.ts`, `src/model/numbering/document-numbering.ts`, `src/model/format/template-format.ts`
Verification: `src/model/templates/template-properties.test.ts`

## DOCE-NUMBERING-3 - Paragraph numbering

### DOCE-NUMBERING-3.1 - Paragraph levels

`resolveParagraphLevelStyle(config, level, headingDepth)` shall take the format and the number and text positions of the configured level for the paragraph's displayed depth (heading depth plus level), else the style's format. Below a heading only the paragraph's own levels shall be kept.

Implementation: `src/model/numbering/paragraph-numbering.ts`
Verification: `src/model/numbering/paragraph-numbering.test.ts`

### DOCE-NUMBERING-3.2 - Paragraph counters

`advanceParagraphCounters(counters, level)` shall open every unopened level above the paragraph's at 1, advance its own and reset the deeper ones, and return the paragraph's number parts.

Implementation: `src/model/numbering/paragraph-numbering.ts`
Verification: `src/model/numbering/paragraph-numbering.test.ts`

### DOCE-NUMBERING-3.3 - Numbered content

A paragraph shall be numbered only when it holds text other than whitespace and zero-width placeholders, or an inline atom other than a line break.

Implementation: `src/model/numbering/paragraph-numbering.ts`
Verification: `src/model/numbering/paragraph-numbering.test.ts`

### DOCE-NUMBERING-3.4 - Paragraph indentation

`paragraphNumberingIndentationStyle(style, { level, label })` shall indent a numbered paragraph 20pt per level below the first (`--doc-paragraph-indentation`) and place its number and its text, from the content edge, as `--doc-paragraph-number-indent` and `--doc-paragraph-text-indent`. A level that sets its text position shall put the text there and the number at its number position, else at the content edge. A level without one shall reserve a gutter for the label: the number shall start after the indentation and the number position, and the text after the room the label takes (DOCE-NUMBERING-3.5), so the indentation adds to that room. A position that is not a length (DOCE-TEMPLATES-5.2) shall be left out.

Implementation: `src/model/numbering/paragraph-numbering.ts`, `labs/reference/document.css`
Verification: `src/model/numbering/paragraph-numbering.test.ts`, `e2e/numbering.spec.ts`

### DOCE-NUMBERING-3.5 - Room for the label

`paragraphNumberWidth(label)` shall give the room a paragraph's number takes before its text, in widths of the font's zero (`ch`): each character by its advance, on the generous side for capitals and wide letters and no narrower than a digit, so a fixed-width font fits too, and a gap after the label, rounded up to a tenth.

Implementation: `src/model/numbering/paragraph-numbering.ts`
Verification: `src/model/numbering/paragraph-numbering.test.ts`

## DOCE-NUMBERING-4 - Captions

### DOCE-NUMBERING-4.1 - Caption placement

`buildCaptionPlacementVariables(styles)` shall place table, figure and code block captions where each style's `caption.placement` says, as `--doc-table-caption-order`, `--doc-figure-caption-order` and `--doc-code-caption-order` (`-1` above, `1` below). Figures shall default to below and tables and code blocks to above; without defaults only the kinds a style sets are given.

Implementation: `src/model/numbering/caption-placement.ts`
Verification: `src/model/numbering/caption-placement.test.ts`

## DOCE-NUMBERING-5 - Number text

### DOCE-NUMBERING-5.1 - Heading numbers

`headingNumberText(config, level, counters, affixes)` shall write a heading's number as its counter content prints it: one counter per level down to its own, with its prefix, suffix and separators, and `0` for a counter nothing has advanced yet. A format that does not number the level shall give an empty text.

Implementation: `src/model/numbering/numbering-text.ts`
Verification: `src/model/numbering/numbering-text.test.ts`

### DOCE-NUMBERING-5.2 - Object numbers

`objectNumberText(config, count, headingCounters, options)` shall write an object's number as its caption's counter content prints it, with its caption label and the heading context its numbering asks for, leaving out the context levels its separator allows it to omit.

Implementation: `src/model/numbering/numbering-text.ts`, `src/model/templates/template-numbering.ts`
Verification: `src/model/numbering/numbering-text.test.ts`

### DOCE-NUMBERING-5.3 - Object numbering defaults

`resolveObjectNumbering(styles, kind)` shall number a figure, table, code block or equation one by one (`1`) when its numbering sets no format, and label it with its kind's label (`DEFAULT_OBJECT_LABELS`: `Figure `, `Table `, `Code Block `, `Eq. `) when it sets no prefix, so the caption, the catalog and references agree. A prefix it sets, empty included, shall be its own, and an empty format or `enabled: false` shall number nothing. The base template labels code blocks `Code Block `.

Implementation: `src/model/templates/template-numbering.ts`, `src/model/templates/base-template.ts`
Verification: `src/model/numbering/numbering-text.test.ts`

## DOCE-NUMBERING-6 - Numbered paragraphs

### DOCE-NUMBERING-6.1 - Paragraphs numbered in the editor

`createParagraphNumbering({ template })`, which the editing plugins install when given the template, shall number each top-level paragraph of the body that earns a number (DOCE-NUMBERING-3.3) in a section whose template scope numbers paragraphs (`numberedParagraphs`), in every state it runs in, so the layout engine lays the numbers out too. A numbered paragraph shall carry its number as `data-paragraph-number` and its level as `data-paragraph-level`, with its level's indentation properties (DOCE-NUMBERING-3.4); paragraphs in lists, tables, columns and page regions shall not be numbered. On the pages, a later part of a paragraph split over pages counts nothing and shows no number, as a later part of a split heading shows none: it carries `data-paragraph-continued="true"` (with an empty `data-paragraph-number` where the pages number their own state, and the whole's where the editor's pages draw the canonical numbers, DOCE-PAGINATION-11.9) and its first part's level and indentation properties, so every one of its lines starts at its first part's text position and the reference stylesheet draws no number before it, and the paragraphs after it keep their numbers. The paragraphs shall be numbered again after every change of the document or of the template. The base template keeps its paragraph format and levels switched off (`enabled: false`), so a template numbers paragraphs only when it switches them on.

Implementation: `src/engine/paragraph-numbering.ts`, `src/engine/document-editing.ts`, `src/model/templates/base-template.ts`
Verification: `src/engine/paragraph-numbering.test.ts`

### DOCE-NUMBERING-6.2 - Counting through the pages

The counters (DOCE-NUMBERING-3.2) shall run through the document in order, across its pages, at the level of each paragraph's displayed depth under the last heading (DOCE-NUMBERING-3.1). A paragraph or heading the pages split is one element of the document and counts once. Each heading other than the title shall start the counters again, and so shall a section that restarts numbering (`sectionRestartsNumbering`).

Implementation: `src/engine/paragraph-numbering.ts`
Verification: `src/engine/paragraph-numbering.test.ts`

### DOCE-NUMBERING-6.3 - Paragraph number text

`paragraphNumberText(format, parts, options)` shall write a paragraph's number as the heading number it is under (`context`, DOCE-NUMBERING-6.5), then each of its counters in its level's format character, joined by the levels' separators (the format's last level for counters past its levels), then the trailing separator and the suffix, after the prefix and, for a prefix not ending in space, the trailing separator.

Implementation: `src/engine/paragraph-numbering.ts`
Verification: `src/engine/paragraph-numbering.test.ts`

### DOCE-NUMBERING-6.4 - Counting on the pages

The reference stylesheet shall count headings, tables, figures and code blocks on the pages, the only place the document is rendered (DOCE-PAGINATION-7.17), so the first captioned table of the document is table 1.

Implementation: `labs/reference/document.css`
Verification: `e2e/numbering.spec.ts`

### DOCE-NUMBERING-6.5 - Heading number before paragraph numbers

A numbered paragraph under a numbered heading shall show the heading's number before its own counters, so paragraphs under heading `1.2.` read `1.2.1.`, `1.2.2.`. The heading's number shall be its counters as its level's format writes them (DOCE-NUMBERING-5.1), without the heading's prefix and suffix, and followed by the heading format's trailing separator, or else by the paragraph format's. Headings shall be counted as the stylesheet counts them: across sections, again from a section that restarts numbering, and not at all for the title or an unnumbered heading. A heading that shows no number shall start the paragraph counters again and give them nothing before them.

Implementation: `src/engine/paragraph-numbering.ts`
Verification: `src/engine/paragraph-numbering.test.ts`, `e2e/numbering.spec.ts`

### DOCE-NUMBERING-6.6 - Typing keeps the numbers

A change that only types or deletes text, and leaves every block it types in earning a number or not as before (DOCE-NUMBERING-3.3), shall keep the paragraph numbers without walking the document. Typing the first visible text into a paragraph, or deleting its last, shall number the paragraphs again.

Implementation: `src/engine/paragraph-numbering.ts`
Verification: `src/engine/paragraph-numbering.test.ts`, `src/engine/hot-path.test.ts`
