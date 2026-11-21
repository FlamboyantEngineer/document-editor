---
'@flamboyantengineer/document-editor': patch
---

Layout engine (behind `textLayout`, not exported): block geometry reads the text layout engine's own line tables, and the engine counts caption labels, ordered list markers and footnote numbers, with footnote markers measured with their numbers.
