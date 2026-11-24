---
'@flamboyantengineer/document-editor': patch
---

Repaginating a large document after an edit near its start is cheaper: a section's pages join their fragments where each two pages meet, round after round, instead of in the one page that holds them all, and the target's attributes are copied in one walk. Pages, documents and position mappings are unchanged.
