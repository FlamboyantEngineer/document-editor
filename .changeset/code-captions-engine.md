---
'@flamboyantengineer/document-editor': patch
---

The text layout engine lays code captions out, so a code figure, and a table or quote that holds one, is planned by the engine rather than measured in the browser; each part of a split code figure is planned with the caption it draws again. Block margins are now planned as Chromium draws them, truncated to its layout unit (an 8pt margin is 10.656px rather than 10.672px), which can move where pages break in documents with such margins.
