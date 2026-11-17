---
"@flamboyantengineer/document-editor": minor
---

The comment store's `reply` now takes `(documentId, { threadId, text, id })`; the editor chooses an `id` per reply and keeps it for each retry of that reply, so a store that already holds it does not add it twice. The in-memory host and the room comment store honour it.
