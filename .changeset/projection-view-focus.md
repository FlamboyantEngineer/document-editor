---
'@flamboyantengineer/document-editor': patch
---

A paged projection's own view (`createProjectionView`) now takes focus as the editor does, so a key pressed right after focus on a busy page keeps its selection instead of having the older one drawn back over it (DOCE-PAGINATION-7.22).
