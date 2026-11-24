---
'@flamboyantengineer/document-editor': minor
---

`readMarkdown` parses with markdown-it and markdown-it-footnote, in place of the library's own parser, mapping the tokens to the same stored document. It now reads Markdown as CommonMark does where the old parser did not: nested emphasis, entity and numeric character references, lazy quote continuation lines, a footnote's later paragraphs and definitions that cannot interrupt a paragraph. Inline math is still read as Pandoc reads it, reading takes time in proportion to the text, and nesting deeper than 32 levels is flattened with a warning. A `$$` fence with text after its opening signs opens display math, and the text is left out with a `content-left-out` warning.
