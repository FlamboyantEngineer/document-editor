---
'@flamboyantengineer/document-editor': minor
---

`readMarkdown` parses with mdast-util-from-markdown and its GitHub (tables, strikethrough, footnotes, task lists) and math extensions, in place of the library's own parser, mapping the tree to the same stored document. It now reads Markdown as CommonMark does where the old parser did not: nested emphasis, entity and numeric character references, lazy quote continuation lines, a footnote's later paragraphs and definitions that cannot interrupt a paragraph. Inline math is still read as Pandoc reads it, and nesting deeper than 32 levels is flattened with a warning.

A `$$` fence with text after its opening signs now opens display math, as micromark-extension-math reads it, and the text is left out with a `content-left-out` warning. A host adds `"overrides": { "micromark-extension-math": { "katex": "$katex" } }` to its `package.json`, so the math extension shares the host's KaTeX (README).
