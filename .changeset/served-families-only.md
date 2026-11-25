---
'@flamboyantengineer/document-editor': patch
---

Two cases where the layout engine refused a block now follow what the pages draw. A template font that no font file from the host serves is laid out and drawn in the template's served body family, instead of being measured in a local or fallback font, and the missing-fonts banner names it; a family a later template names, such as one picked in a template field, is asked of the host and drawn in its own faces once they arrive, and a print of the pages draws every font as they do. A template variable with no values given, as in a footnote area, is laid out as the text it holds.
