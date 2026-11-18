---
'@flamboyantengineer/document-editor': minor
---

Footnote numbers are no longer document content. The schema drops `footnoteNumber`, so the editing state, a shared room, the stored file and versions hold no number, and writers in different layouts no longer renumber each other. Each view draws its own numbers with `createFootnoteNumbers` (installed by the editing extension), on the same `data-footnote-number` and tooltip hooks: through the document, in each section in the web layout of a template that numbers per page, or on each page in the paged layout. `numberFootnoteParts`, `renumberFootnotes`, `footnoteNumberOf`, `unpagedNumbering` and `withFootnoteNumbers` are new; `numberFootnotes`, `createSectionFootnoteNumbers`, `sectionFootnoteNumbersKey` and the footnote plugin's `numberInOrder` option are removed. The shared-room guard drops its footnote numbering rule.
