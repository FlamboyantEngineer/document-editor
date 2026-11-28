---
'@flamboyantengineer/document-editor': patch
---

A template variable's value longer than its line wraps as ordinary text, its white space kept: the layout engine breaks it between its words, which the pages, the viewer and print draw word by word with the engine's breaks, so a long title in a header takes the lines the layout gave it. A header or footer is laid out with a variable's whole value, and the text's lines are drawn again once a document with other stored values is laid out, as one opened after another.
