---
'@flamboyantengineer/document-editor': minor
---

With `textLayout: 'pretext'`, the engine keeps Pretext's measured widths and every block's prepared text between layouts, so long documents lay out again quickly; a snapshot no longer undoes the host's `drawAllLines(true)`; `PagesLayout` gains `provisional`, true while its page breaks may still move; and the reference stylesheet turns `font-synthesis` off on Pretext pages. `DocumentViewer` draws the pages a screen before they scroll into its frame and no longer redraws every page when given new options with the same fields.
