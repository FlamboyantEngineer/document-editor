---
'@flamboyantengineer/document-editor': patch
---

The text layout engine keeps the widths of the number and gutter texts it measures, so blocks that show the same number or gutter measure them once. It also merges a template scope's styles once, not once per block, which was about 40% of laying out a long list of contents.
