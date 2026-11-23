---
'@flamboyantengineer/document-editor': minor
---

Under `textLayout: 'pretext'` with served fonts, the pages' layout (`pagesLayout()`) carries the served faces the pages were measured and drawn with (`fonts`). The print drawn from the layout holds them inline as `@font-face` rules and draws generic families as their served families, `DocumentViewer` adds them to its document while it shows the pages, and the handle's snapshots hold them too, so a PDF embeds the same faces its lines were broken in. `printSnapshot` asks for every face the snapshot's text is drawn in before it waits for the fonts, so a face held inline is loaded before the page prints.
