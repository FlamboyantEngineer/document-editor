---
'@flamboyantengineer/document-editor': patch
---

A later part of a split table that opens with a body row, which shows no caption, no longer counts the caption's height, in both layout modes, so the pages fill as they are drawn. Under `textLayout: 'pretext'`, the fixed table layout's page count difference is recorded as accepted, and column resizing and the page-content limit are tested on it.
