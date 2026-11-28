---
'@flamboyantengineer/document-editor': patch
---

The paged editor no longer waits without end on math: MathJax, its font and each glyph range get 30 seconds to load, after which the math waiting on them takes the reserved box, and the pages wait at most 30 seconds for the document's math before they are laid out with the math they have, saying why in the layout trace.
