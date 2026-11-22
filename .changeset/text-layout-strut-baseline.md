---
'@flamboyantengineer/document-editor': patch
---

The text layout engine puts a line's baseline where Chromium does: half the leading above the font, truncated to whole device pixels rather than to the layout unit.
