---
'@flamboyantengineer/document-editor': patch
---

The paged editor loads MathJax and its STIX Two font only when the first equation is laid out, so a document without math no longer fetches them before its first pages. Math waits on provisional boxes while MathJax loads, as it does for glyph ranges.
