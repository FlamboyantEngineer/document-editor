---
'@flamboyantengineer/document-editor': patch
---

A long document's first layout under `textLayout: 'pretext'` settles sooner: a change's ranges are mapped only through the steps that move positions, so giving every element its id is no longer quadratic in the number of elements, and until the pages near the screen are known the check of the drawn pages reads only those near the frame, so the pages far from it keep skipping their layout.
