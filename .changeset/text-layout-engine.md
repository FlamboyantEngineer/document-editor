---
'@flamboyantengineer/document-editor': patch
---

A text layout engine (`src/layout-engine/`, DOCE-PAGINATION-9) lays paragraphs, headings and code blocks out on lines from their template typography with Pretext, without the DOM, as a line table the page packer's paragraph splits can read. No entry point exports it yet and the editor does not use it.
