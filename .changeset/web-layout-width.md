---
'@flamboyantengineer/document-editor': minor
---

`DocumentEditor` takes `webWidth` (`fill` or `page`, published as `data-web-width`) so a document's web layout can keep its page width. The reference stylesheet's web layout hides the pages' headers and footers and takes the page background from `--doc-page-background`. A page-width web layout drops the page margins. Blocks in headers and footers no longer get vertical margins.
