---
'@flamboyantengineer/document-editor': minor
---

Tables can be suggested whole. While suggesting, inserting a table makes it a suggested insertion, and a new block put in place of an empty paragraph goes after it. Deleting a whole table makes it a suggested deletion with its text marked. The table's holder (`table_figure`) carries `suggestionSplitKind`, `suggestionSplitId` and `dataAuthor`. The stored format keeps them on the table as `suggestionKind`, `suggestionId` and `author`. Version comparisons with suggestions rejected leave a suggested table out whole.
