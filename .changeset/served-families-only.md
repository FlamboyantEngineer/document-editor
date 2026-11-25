---
'@flamboyantengineer/document-editor': patch
---

Two cases where the layout engine refused a block now follow what the pages draw. A template font that no font file from the host serves is laid out and drawn in the template's served body family, instead of being measured in a local or fallback font, and the missing-fonts banner names it. A template variable with no values given, as in a footnote area, is laid out as the text it holds.
