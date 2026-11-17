---
'@flamboyantengineer/document-editor': minor
---

`copyDocumentFile(file, { newId, author })` makes a new document from a stored one, as a host's "copy from" does: every element gets a fresh id and the copying writer as its author, and comment highlights are dropped, since the copy has no threads.
