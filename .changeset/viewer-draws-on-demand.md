---
'@flamboyantengineer/document-editor': patch
---

`DocumentViewer` draws a page's content as HTML, and asks the host's `resolveImage` for its images, only when the page first comes near the view, so a long document no longer resolves every page's images when it opens.
