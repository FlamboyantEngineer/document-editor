# Regression documents

Generic stored documents (`DocumentFile`, [FORMAT.md](../../../specs/FORMAT.md)) written for the library, and the templates (`TemplateFile`) they use. They cover every built-in node and mark type and the document shapes that stress reading, writing, numbering and pagination. The text is sample text about gardens, weather stations and reading rooms; it means nothing.

[`regression-set.test.ts`](regression-set.test.ts) checks that every document reads and writes back to the same bytes, that every element id is a unique 8-digit hexadecimal string, that every template is valid, and that each document uses a template of the set and only its sections, with locked sections holding the template's content. Later suites (pagination labs, collaboration, export) take their documents from here.

## Rules

- Write new text. Never copy a host application's documents, names or terms; `npm run check:references` scans these files.
- Store each file as the writer writes it: attributes at their default left out, adjacent text with the same marks joined, attributes and marks in schema order, formatted by Prettier. The round-trip test fails on anything else.
- Give each element an id of 8 lower-case hexadecimal digits, unique within its document. Empty paragraphs and a locked section's template content may go without one.
- Add a line below for each new document.

## Templates

| Template                    | Shape                                                                                                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `regression-base`           | A4 portrait; numbered headings (`1.`, `1.1`, `1.1.1`), paragraphs and captions; repeated table headers; header and footer with page variables; document-wide footnote numbers. |
| `regression-mixed-geometry` | Inherits the base. An A5 cover with empty regions, a US Legal body, and an A4 landscape appendix that restarts numbering as `A.` and `A.1` and inherits the footer.            |
| `regression-numbering`      | Inherits the base. Lower-case Roman front matter (`i.`), upper-case Roman body (`I.`, `I.1`, `I.1.a`) and an alphabetic annex (`A-`, `A-1`, paragraphs `a)`).                  |
| `regression-locked`         | Inherits the base. Required, optional, insertable and locked (`editable: false`) sections, with fixed content and a placeholder.                                               |
| `regression-tables`         | Inherits the base. One section repeats table headers on every page, the other shows them on the first page only.                                                               |
| `regression-footnotes`      | Inherits the base. US Letter, footnotes numbered per page, with their own spacing and text style.                                                                              |

## Documents

| Document                            | Template                    | Shape                                                                                                                      |
| ----------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `authorship`                        | `regression-base`           | Element authors and assistant sessions, and the contributor mark.                                                          |
| `blockquotes`                       | `regression-base`           | Quotes, a nested quote with a list, and a quote of twelve paragraphs that splits across pages.                             |
| `code-blocks`                       | `regression-base`           | Code in several languages, with and without captions, an empty block and a 150-line listing.                               |
| `columns`                           | `regression-base`           | Every column layout preset, with paragraphs, lists and a figure in columns.                                                |
| `comments-and-suggestions`          | `regression-base`           | Open and resolved comments, insertions, deletions, overlapping marks and a paragraph split by a suggestion.                |
| `contents-lists`                    | `regression-base`           | Lists of contents, figures and tables, with depth and reference filters, and the entries they list.                        |
| `cross-references`                  | `regression-base`           | References to a heading, figure, table, code block and equation, and a broken reference.                                   |
| `empty-sections`                    | `regression-mixed-geometry` | Every section holds one empty paragraph.                                                                                   |
| `figures`                           | `regression-base`           | Image and diagram figures in every layout, with and without captions, sizes and stored assets.                             |
| `footnote-heavy`                    | `regression-footnotes`      | Thirty paragraphs with two or three footnotes each, some long and some formatted.                                          |
| `footnotes-in-structures`           | `regression-base`           | Footnotes in lists, table cells and quotes, and an empty footnote.                                                         |
| `heading-keep-with-next`            | `regression-base`           | Thirty headings each followed by a long paragraph or a table, for keep-with-next.                                          |
| `headings-all-levels`               | `regression-base`           | A title heading and headings at levels 1 to 6.                                                                             |
| `inline-images`                     | `regression-base`           | Inline images, sized and unsized, in text.                                                                                 |
| `inline-marks`                      | `regression-base`           | Bold, italic, underline, strike, superscript, subscript, code and links, alone and combined.                               |
| `line-breaks-and-writing-systems`   | `regression-base`           | Line breaks, accented, right-to-left and East Asian text, combining marks, and invisible spaces.                           |
| `linked-code`                       | `regression-base`           | Linked code blocks with a language and a start line.                                                                       |
| `locked-sections`                   | `regression-locked`         | Every section, the optional one included; locked sections keep the template's content.                                     |
| `locked-sections-optional-left-out` | `regression-locked`         | The required sections only, with an empty summary.                                                                         |
| `long-bullet-list-with-nesting`     | `regression-base`           | A forty-item bulleted list with nested lists every fifth item.                                                             |
| `long-mixed`                        | `regression-base`           | Twelve chapters of headings, lists, tables, code, footnotes, quotes, figures and page breaks.                              |
| `long-ordered-list`                 | `regression-base`           | An eighty-item numbered list that splits across pages.                                                                     |
| `math`                              | `regression-base`           | Inline and display equations, empty ones included.                                                                         |
| `minimal-paragraph`                 | `regression-base`           | One paragraph.                                                                                                             |
| `mixed-geometry`                    | `regression-mixed-geometry` | A5 cover, US Legal body with a long table, and an A4 landscape appendix with a wide table.                                 |
| `mixed-geometry-repeated-sections`  | `regression-mixed-geometry` | The appendix section three times.                                                                                          |
| `nested-lists`                      | `regression-base`           | Bulleted and numbered lists nested four deep, items with two paragraphs, and lists starting at other numbers.              |
| `oversized-blocks`                  | `regression-base`           | A paragraph, a quoted code block and a list item each longer than a page.                                                  |
| `page-breaks-and-rules`             | `regression-base`           | Page breaks, two in a row, and a rule.                                                                                     |
| `paragraph-levels-and-styles`       | `regression-base`           | Paragraph levels 1 to 6 and custom paragraph styles.                                                                       |
| `people-and-abbreviations`          | `regression-base`           | Mentions, full and short abbreviations, and a signed and an unsigned signature.                                            |
| `roman-and-alpha-numbering`         | `regression-numbering`      | Roman front matter with a list of contents, a Roman body of 25 chapters, and an alphabetic annex with numbered paragraphs. |
| `roman-numbering-stress`            | `regression-numbering`      | Sixty Roman-numbered headings in the front matter.                                                                         |
| `scripts`                           | `regression-base`           | Script blocks with generated content, refreshed on open or by hand, and an empty one.                                      |
| `table-both-header-modes`           | `regression-tables`         | Two long tables, one in each header mode.                                                                                  |
| `table-long-headerless`             | `regression-tables`         | A 120-row table without a header row.                                                                                      |
| `table-long-repeated-header`        | `regression-tables`         | A 150-row table whose header repeats on every page.                                                                        |
| `table-long-single-header`          | `regression-tables`         | A 150-row table whose header shows on the first page only.                                                                 |
| `table-merged-cells`                | `regression-base`           | Row and column spans, column widths, alignment, row height, colors and a bordered table.                                   |
| `table-rich-cells`                  | `regression-base`           | Lists, code, several paragraphs and a nested table in cells; borderless, centered, fitted and right-aligned tables.        |
| `table-simple`                      | `regression-base`           | A captioned table with a header row and an uncaptioned one without.                                                        |
| `table-wide`                        | `regression-base`           | Twelve columns by twenty rows.                                                                                             |
| `template-blocks-and-variables`     | `regression-base`           | Template blocks, one empty, and variables in text.                                                                         |
| `unnamed-sections`                  | `regression-base`           | Content before and after the template's sections, outside any section.                                                     |
