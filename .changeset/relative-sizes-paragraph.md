---
'@flamboyantengineer/document-editor': patch
---

Relative sizes resolve against the template's paragraph size: the paragraph's own relative size resolves once against 12px and is written in pixels, the reference stylesheet's page content takes the paragraph's font, size and line height, and captions with unset fonts take the paragraph's font at its line height, in both text layout modes.
