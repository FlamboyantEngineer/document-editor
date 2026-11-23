---
'@flamboyantengineer/document-editor': patch
---

Under `textLayout: 'pretext'`, the pages break lines and shape text in the language they are drawn in (the `lang` of the editor's element or its nearest ancestor), and lay out again when it changes. The layout engine sets that language once per change instead of on every paragraph, which kept dropping its caches.
