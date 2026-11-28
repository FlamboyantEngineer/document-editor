---
'@flamboyantengineer/document-editor': patch
---

Math whose glyphs still load is no longer converted again each time the pages ask whether it is ready, and each equation's MathML is written once, so a document with waiting equations does less work on every read.
