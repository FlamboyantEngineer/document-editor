---
'@flamboyantengineer/document-editor': patch
---

Pages with no layout engine to wait for fail their layout, with the reason in the layout's trace, rather than stay pending: a projection given no engine, served fonts that cannot be read, or an engine that fails to load.
