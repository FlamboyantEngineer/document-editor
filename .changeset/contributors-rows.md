---
'@flamboyantengineer/document-editor': minor
---

The contributors pane lists one stable row per writer by name, with no character count (the `contributorCharacters` label is gone). A named writer's row opens a card on hover and focus (`renderCard` replaces it), the system's changes show as a plain `System` row, and text with no writer adds a last `Unknown` row (`hasUnattributedText`).
