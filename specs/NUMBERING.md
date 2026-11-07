# Numbering

A template numbers headings, paragraphs and captioned objects with numbering formats such as `1.1`, `a)` or `I-1`. The model turns a format into the CSS `content` and counter styles the document's stylesheet uses, so the editor, a preview and an export number the same way. Stored formats are a compatibility contract: a format reads the same in every version. The model reads no DOM, so a server builds the same numbering.

## DOCE-NUMBERING-1 - Formats

### DOCE-NUMBERING-1.1 - One level per character

`parseNumberingStyle(format)` shall read one level per letter or digit, with the text after it as that level's separator, so `11` and `IA` are two levels; the last separator is the format's trailing separator. An empty format shall read as `1`. A list style name, such as `upper-roman` or `lower-latin`, shall read as its one-level format with a trailing `.` (`normalizeNumberingPattern`).

Implementation: `src/model/numbering/numbering-format.ts`
Verification: `src/model/numbering/numbering-format.test.ts`

### DOCE-NUMBERING-1.2 - Counter styles

A format character shall name its counter style: `1` decimal, a lower-case letter lower alpha and an upper-case letter upper alpha, `i` and `I` (any roman letters, and `R`) lower and upper roman. A style name shall read as itself, a prefixed roman style name (`<prefix>-upper-roman`) as the roman style, and anything else as decimal. Roman styles shall print with the library's own counter styles, `de-upper-roman` and `de-lower-roman` (`resolveCssCounterStyleToken`).

Implementation: `src/model/numbering/numbering-format.ts`
Verification: `src/model/numbering/numbering-format.test.ts`

### DOCE-NUMBERING-1.3 - Roman numerals

`formatRoman` shall write any positive safe integer in roman numerals, repeating `M` past 3999, and throw a `RangeError` for anything else. `parseRoman` shall read canonical subtractive numerals in one letter case and return null for anything else, such as `IIII` or mixed case.

Implementation: `src/model/numbering/numbering-format.ts`
Verification: `src/model/numbering/numbering-format.test.ts`

### DOCE-NUMBERING-1.4 - Counter text

`formatCounterValue(value, character)` shall print a counter in the character's style, alphabetic counters continuing `Z`, `AA`. A missing, invalid or non-positive value shall count as 1.

Implementation: `src/model/numbering/numbering-format.ts`
Verification: `src/model/numbering/numbering-format.test.ts`

### DOCE-NUMBERING-1.5 - Counter style rules

`DOCUMENT_COUNTER_STYLE_CSS` shall define every counter style the numbering content uses: the roman styles, without the browser's 3999 limit (`ROMAN_COUNTER_STYLE_CSS`), and the context styles that print a heading counter above 0 and nothing at 0 (`de-context-<style>`), with one separator style per separator they can leave out (`de-context-separator-<name>`, for `.`, `-`, `:`, `_`, `/`, space and `)`) (`OBJECT_CONTEXT_COUNTER_STYLE_CSS`).

Implementation: `src/model/numbering/numbering-format.ts`
Verification: `src/model/numbering/numbering-format.test.ts`

### DOCE-NUMBERING-1.6 - Section formats

A section's object style shall override the document's (`mergeSectionObjectStyle`), except that a blank section format inherits the document's, since an emptied field is saved as an empty string.

Implementation: `src/model/numbering/numbering-format.ts`
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

### DOCE-NUMBERING-2.5 - Inherited paragraph styles

`resolveParagraphNumberingConfig(style, inherited)` shall take a paragraph style's format, levels, prefix and suffix, and the inherited ones for what it does not set. An empty format shall switch numbering off.

Implementation: `src/model/numbering/document-numbering.ts`
Verification: `src/model/numbering/document-numbering.test.ts`

## DOCE-NUMBERING-3 - Paragraph numbering

### DOCE-NUMBERING-3.1 - Paragraph levels

`resolveParagraphLevelStyle(config, level, headingDepth)` shall take the format and indentation of the configured row for the paragraph's displayed depth (heading depth plus level), else the style's format. Below a heading only the paragraph's own levels shall be kept. An indentation shall be a non-negative number of pixels or a length in `pt`, `px`, `mm`, `cm`, `in`, `em` or `rem`; anything else is unset.

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

`paragraphNumberingIndentationStyle` shall set `--doc-paragraph-indentation`, `--doc-paragraph-number-indent` and `--doc-paragraph-text-indent` from the level's settings, a bare number in pixels. A level without its own indentation shall be indented 20pt per level below the first.

Implementation: `src/model/numbering/paragraph-numbering.ts`
Verification: `src/model/numbering/paragraph-numbering.test.ts`

## DOCE-NUMBERING-4 - Captions

### DOCE-NUMBERING-4.1 - Caption placement

`buildCaptionPlacementVariables(styles)` shall place table, figure and code block captions above or below their object, as `--doc-table-caption-side` (`top`, `bottom`), `--doc-figure-caption-order` and `--doc-code-caption-order` (`-1` above, `1` below). Figures shall default to below and tables and code blocks to above; without defaults only the kinds a style sets are given.

Implementation: `src/model/numbering/caption-placement.ts`
Verification: `src/model/numbering/caption-placement.test.ts`
