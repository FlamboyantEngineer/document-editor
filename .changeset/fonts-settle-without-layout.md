---
'@flamboyantengineer/document-editor': minor
---

Pages that waited for the template's served fonts settle once the fonts arrive, without being laid out a third time (DOCE-PAGINATION-7.6); the projection gains `fontsChanged()`, which replaces the editor's layout on each change of the pending fonts.
