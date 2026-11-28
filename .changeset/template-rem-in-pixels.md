---
'@flamboyantengineer/document-editor': patch
---

A template's `rem` lengths and sizes now reach the stylesheet in pixels at the 16px root size the layout engine lays them out at, so a host page with another root font size no longer draws them at another size than the pages were laid out with.
