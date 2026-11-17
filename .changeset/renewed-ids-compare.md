---
'@flamboyantengineer/document-editor': patch
---

Comparing versions pairs a block whose element id was made again with the older block of the same kind and text, so a version whose ids were all regenerated compares unchanged instead of as everything deleted and inserted.
