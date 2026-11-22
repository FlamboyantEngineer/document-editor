---
'@flamboyantengineer/document-editor': patch
---

With `textLayout: 'pretext'`, the pages' engine measures atoms as the pages draw them (typeset math, template blocks, signatures and host node views, in their block's font and section), lays out mentions and glossary references as text, numbers footnote markers through the document, keeps a block by its markers' numbers, and gives `lines()` the lines `measureBlock` laid out, paragraph number included. The layout guard no longer counts a tall inline atom as a wrapped line, and the layout debugging shows the heights of the latest layout.
