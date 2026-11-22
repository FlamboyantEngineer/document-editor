---
'@flamboyantengineer/document-editor': patch
---

Layout engine (behind `textLayout`, not exported): an atom that is itself a loading image is provisional, every node sharing a loading atom is told when it settles, and a table column without a width keeps an equal share when stored widths fill the table.
