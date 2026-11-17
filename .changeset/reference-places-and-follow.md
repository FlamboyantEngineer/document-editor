---
'@flamboyantengineer/document-editor': minor
---

References: a plain click follows an internal reference while editing too; Mod-K and the toolbar share `canInsertReference`, which now also allows changing a reference already in a heading; text moved where references may not go loses its references (`repairMovedReferences`); citation identifiers stay unbreakable (`createReferenceIdentifiers`, `data-reference-identifier`); the list of references drops a citation without a document number beside a recorded one of the same document (`ContentsKind.drop`); a secondary click can keep the selection (`contextMenu.keepSelection`); a dialog that fails to load closes, tells the writer (`dialogUnavailable`) and loads again next time.
