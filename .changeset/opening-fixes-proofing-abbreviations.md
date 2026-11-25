---
'@flamboyantengineer/document-editor': patch
---

A first proofing check the host holds back with `scheduleFirstCheck` is no longer started by a change made before the host runs it, such as the pages being laid out. Refreshing abbreviations on opening now reads the document the editor is given, so it also works when a host gives the editor a new document in place of the one shown.
