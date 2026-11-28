---
'@flamboyantengineer/document-editor': patch
---

The paged editor keeps its layout engine, and every block it laid out, when the host hands over an equal copy of the template, as a host that builds its template object on each render does. Before, each new object laid the whole document out again.
