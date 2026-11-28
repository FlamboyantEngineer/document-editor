---
'@flamboyantengineer/document-editor': patch
---

Figure and table boxes, and the rows a list of contents is drawn on, are now read from the block layout the engine kept, with the words inserted in the block that the pages were laid out with. A row or figure resize no longer lays the block out again on each move of the drag, and a comparison view reads the boxes of its own layout.
