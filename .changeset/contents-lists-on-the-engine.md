---
'@flamboyantengineer/document-editor': patch
---

Under `textLayout: 'pretext'`, lists of contents are laid out by the layout engine: their title, empty message and rows, each row's page box keeping room for three digits (more past page 999), drawn at the width the engine kept and broken only where the engine broke its lines. Rows wrap against that room rather than their page's own width, a few pixels narrower than before.
