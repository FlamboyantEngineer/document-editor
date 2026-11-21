---
'@flamboyantengineer/document-editor': patch
---

Block geometry (`src/layout-engine/blocks/`, DOCE-PAGINATION-10) lays lists, quotes, code, tables, captions, figures, equations, layout sections, headers, footers and footnote areas out without the DOM, from the text layout engine's lines and the template's numbers, in the shapes the page layout already reads. An atom cache (`src/layout-engine/atoms.ts`) measures what only the browser can size once, keyed by content, with provisional sizes while images load. No entry point exports them yet and the editor does not use them.
