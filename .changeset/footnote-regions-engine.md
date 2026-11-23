---
'@flamboyantengineer/document-editor': minor
---

Under `textLayout: 'pretext'`, page headers, footers and footnote areas take the room the layout engine lays out for them. The footnote separator is now given as `--doc-footnote-separator-thickness` and `--doc-footnote-separator-color` (replacing `--doc-footnote-separator-border`), and the reference stylesheet paints it in the area's padding, so it takes the template's thickness on every screen. Footnote entries no longer take the browser's paragraph margins, only the template's entry spacing.
