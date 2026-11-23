---
'@flamboyantengineer/document-editor': patch
---

The layout guard counts a line that holds only a hard break, so a forced paragraph with an empty line between two breaks is no longer reported as wrapped.
