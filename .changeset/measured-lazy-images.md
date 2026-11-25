---
'@flamboyantengineer/document-editor': patch
---

The pages' measuring view loads a lazy image at once. A figure whose image loads lazily, with no stored height, kept the size it had before its image drew, as an image out of sight never loads, so the pages settled with its block too short and were only laid out again ten seconds later.
