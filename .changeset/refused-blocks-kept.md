---
'@flamboyantengineer/document-editor': patch
---

A block the pages' engine cannot lay out is kept as one object and counted once, so the incremental layout no longer lays out again every page between two such blocks on each keystroke. A block's lines read without other plugins' inserted words, as a print or viewer reads them, no longer replace the editor's lines read with them.
