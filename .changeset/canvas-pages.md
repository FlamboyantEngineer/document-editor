---
'@flamboyantengineer/document-editor': minor
---

Add `rendering: 'html-canvas'` to `DocumentEditor`: in page layout each page is painted into a canvas of its own with the HTML-in-Canvas API, at its exact device pixels, and keeps its HTML as the canvas's content for editing, hit testing and accessibility. Off by default; browsers without the API keep the pages in the DOM.
