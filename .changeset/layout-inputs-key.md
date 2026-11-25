---
'@flamboyantengineer/document-editor': minor
---

The pages' layout carries `inputs`, everything it depended on besides the document (served faces by content hash, generics, Pretext and shaper releases, math layouter, template, language, markup, code line numbers, segmentation data, Unicode version), and one `inputsKey` of them, so a host can tell when two machines may lay a document out on different pages and which input differs.
