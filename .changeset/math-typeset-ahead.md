---
'@flamboyantengineer/document-editor': patch
---

Typeset math ahead of the layout that sizes it. The math views typeset each source once for every view, and the pages wait for a document's math to be typeset before laying it out, so an equation is laid out once at its typeset size and not again when it is drawn. Math whose renderer misses the timeout stays invalid; an answer after it is no longer drawn.
