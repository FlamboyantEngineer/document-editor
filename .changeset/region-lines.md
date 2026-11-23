---
'@flamboyantengineer/document-editor': minor
---

Under `textLayout: 'pretext'`, the text of page headers and footers is drawn on the lines the layout engine laid it out on with its region, with each page's variable values, in the editor, the viewer and prints. `textLines()` gives those blocks too, marked with their `region`, and the pages' engine gains `regionLines(region, scope, variables)`.
