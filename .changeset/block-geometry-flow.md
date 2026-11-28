---
'@flamboyantengineer/document-editor': patch
---

The pages' engine lays blocks out closer to how the stylesheet draws them: margins collapse through a block of no height, a block with no width left is laid out a grapheme a line instead of taking no room, a last checklist item keeps its last block's margin, a cell spanning rows spreads its height over them as Chromium does, and em and rem lengths in the template's paragraph spacing, list, table and footnote settings are read at the font size they are drawn in.
