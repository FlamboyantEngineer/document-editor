---
'@flamboyantengineer/document-editor': minor
---

The document editor draws the lists of contents of a state that holds no contents plugin of the
host's own, with the kinds and labels of its `contents` prop, links a list of references through
its `referenceSource`, and draws the lists again when its template changes. A new document made
without a schema turns each paragraph that is only a list token into a list of contents
(`storedContentsTokens`). The insert menu offers the list of equations before the list of code.
