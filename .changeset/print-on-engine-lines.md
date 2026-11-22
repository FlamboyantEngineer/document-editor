---
'@flamboyantengineer/document-editor': minor
---

Under `textLayout: 'pretext'`, the editor handle's `pagesLayout()` gives the pages' layout as data: the pages' document, each forced block's line marks, and the variable values as the pages show them. `renderLayoutPrintPage(layout, template, options)` in `./document` draws that layout as a standalone print page without an editor or a DOM. It prints every page with its own header and footer, and each paragraph and heading on its computed lines. A print snapshot now keeps the number a forced heading was laid out with, including its space. A static render ends each text block that is empty or ends in no text with the line break a view adds, and a mark that spans several text runs stays one element, as the view draws it.
