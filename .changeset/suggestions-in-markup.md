---
'@flamboyantengineer/document-editor': minor
---

Suggestions known only by their comment thread's id are left out or shown as plain text in every print, snapshot and viewer markup, as those with an id are. With the text layout engine, the pages are laid out in the editor's markup, so the suggestions it hides take no room: a print as if accepted of a long deletion no longer has blank pages. `pagesLayout({ markup })` and a snapshot in another markup lay the pages out in it for that moment. `PagesLayout` carries the `markup` it was laid out in, and `renderLayoutPrintPage` and `DocumentViewer` draw it; their `markup` option is removed (`LayoutPrintOptions`).
