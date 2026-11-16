---
'@flamboyantengineer/document-editor': minor
---

A comparison now counts a changed block kind, container or object (a heading's level, a list's kind, a cell's span, an image's source, a caption) as a modification, and only a changed look (marks, style class, alignment, colors, size, object layout) as formatting. The editor's `compare` takes `generated` to show changes only in generated values.
