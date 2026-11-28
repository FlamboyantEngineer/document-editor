---
'@flamboyantengineer/document-editor': patch
---

The pages' engine lays a comparison's deleted words out where the page draws them: before a template variable at their offset, and laid out again when only the sides they are drawn at change. A line that starts inside a deleted word starts at the word's offset (`TextLine.inWord`), never in the content after it.

Inline code is padded once per `code` element the page draws, not once per text node inside it. Mentions, glossary references, inline embeds and template variables in another font grow their line as text in that font does, and a variable in inline code takes the code's padding.
