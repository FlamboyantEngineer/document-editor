---
'@flamboyantengineer/document-editor': minor
---

References to other documents can cite a heading, figure, table, code block or equation inside the cited document. The reference source may now list a document's targets (`targets`), and its search results may carry a `description` and an `icon` address. The dialog for another document then offers a target type, the whole document by default, and a target of that type, plus an Include revision box. Editing a reference opens its dialog, titled as for inserting it, filled with what it cites.

A citation reads as the template formats its type. Without a format, the built-in type reads as the document's number and title, its revision when shown, and the target (`citationText`, `citationLabel`). The text is written on insertion, on paste and by `refreshReferences`, which now renders citations of other documents too. Each rewrite changes only the text that differs, so unchanged parts keep their own marks. `insertReference` changes an existing reference wherever it is and records a host type's attributes (`attrs`). `referenceKinds` adds the host's own reference types to the reference menu and routes their editing to the host's dialogs. Equation targets are named by their number alone, and linked code by its source. A blank reference format in a child template now inherits the parent's format.
