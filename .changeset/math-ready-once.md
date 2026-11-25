---
'@flamboyantengineer/document-editor': patch
---

Skip the walk for typeset math when the pages lay out the same document again, once all of its math was found typeset, so a document's first layout passes do not each walk it.
