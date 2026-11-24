---
'@flamboyantengineer/document-editor': patch
---

Under `textLayout: 'pretext'`, a paragraph holding a template variable is laid out by the engine: a variable whose value is the same on every page is laid out as the text it shows, and a page's number or the page count takes a box of room for three digits (more past page 999), drawn right-aligned, so a page number in the text now sits in a three-digit box.
