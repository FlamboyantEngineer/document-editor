---
'@flamboyantengineer/document-editor': patch
---

`DocumentViewer` finds its scrolling frame again when another ancestor scrolls or its size changes, so a viewer moved into another scrolling container, or whose container starts scrolling later, keeps drawing the pages near its view.
