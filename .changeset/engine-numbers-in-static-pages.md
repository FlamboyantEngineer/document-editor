---
'@flamboyantengineer/document-editor': minor
---

The pages' layout (`pagesLayout()`) carries the heading, caption and equation numbers the engine laid the pages out with (`numbers`, `PagesLayoutNumber`), and `DocumentViewer` and the prints drawn from the layout draw those numbers. The viewer no longer sets `--de-page-counters`, so a page drawn alone keeps its numbers under `content-visibility: auto` too.
