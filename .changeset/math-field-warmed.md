---
'@flamboyantengineer/document-editor': patch
---

The in-place math field loads once the editable editor shows and the browser is idle, and is kept, so an edit started after that shows its field at once and keys typed straight after `$$` and Enter, or Mod-Alt-L, reach it. Before, the first edit of a session waited for the field and dropped those keys.
