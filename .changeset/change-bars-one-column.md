---
'@flamboyantengineer/document-editor': minor
---

Change bars keep one column at the template's offset from the page's content: the editor measures each barred block's inset (`--de-change-bar-inset-left`, `--de-change-bar-inset-right`), and the reference sheet cancels a list item's, table cell's or quotation's indent with it. `setChangeLines` takes the insets, and `changeInsetsOf` reads them.
