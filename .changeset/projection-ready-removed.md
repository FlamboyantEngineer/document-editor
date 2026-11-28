---
'@flamboyantengineer/document-editor': minor
---

`PagedProjectionOptions.ready` is removed. The pages wait only for the layout engine and its served font files, so nothing in the editor passed another input to wait for.
