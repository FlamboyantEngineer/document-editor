---
'@flamboyantengineer/document-editor': minor
---

Keep a document's stored variable texts in a room one shared attribute per key (`values.<key>`), so an undo of a text two writers set at once no longer clears every stored text, and writers who set different texts at once both keep theirs.
