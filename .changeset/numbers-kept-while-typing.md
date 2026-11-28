---
'@flamboyantengineer/document-editor': patch
---

Typing in a large document no longer numbers the whole document again for each letter: an edit that only changes the text of one text block keeps the numbers the engine counted before, and walks only the path to that block.
