---
'@flamboyantengineer/document-editor': patch
---

On the pages, a key's caret is no longer put back by a React render of an older state that commits after it, from the pages' own render or from the host's state, which made the next key act at the earlier caret (DOCE-PAGINATION-7.25).
