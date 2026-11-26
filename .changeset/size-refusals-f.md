---
'@flamboyantengineer/document-editor': patch
---

`applyEdits` and `applyStoredEdits` refuse a `setAttrs` edit as `invalid` when a value is not of the kind its attribute takes, or leaves out a required one such as a figure's width, instead of throwing.
