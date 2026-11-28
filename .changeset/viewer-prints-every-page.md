---
'@flamboyantengineer/document-editor': patch
---

`DocumentViewer` draws every page while the page that holds it prints, from `beforeprint` to `afterprint` or while the print media query matches, so a printed viewer has no empty sheets. A followed link looks for its anchor in the page it goes to only.
