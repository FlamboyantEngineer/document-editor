---
'@flamboyantengineer/document-editor': patch
---

Pages painted into a canvas (`rendering: 'html-canvas'`) mark the page `drawable`, which Chromium 157 and later need to paint it; a snapshot leaves the attribute out.
