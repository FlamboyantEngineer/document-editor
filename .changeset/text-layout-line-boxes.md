---
'@flamboyantengineer/document-editor': patch
---

The text layout engine grows a line to hold text in a taller font, as Chromium's line box does, and rounds font metrics at the device pixel ratio its new `scale` option gives.
