---
'@flamboyantengineer/document-editor': patch
---

The font-file measurer shapes with every font feature it is given (it dropped those past sixteen), a HarfBuzz heap that cannot grow fails its allocation with an error instead of throwing through the module, and a fonts adapter whose `shaper` or `files` throws synchronously keeps the browser layout with a reason instead of rejecting.
