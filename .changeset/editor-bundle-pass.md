---
'@flamboyantengineer/document-editor': minor
---

The editor's initial code is smaller. The field that edits an equation's source in place, with the code editor it is built on, now loads the first time a writer edits an equation, and `preloadEditorSurfaces` can warm it as the `math` surface. It starts loading once math is selected; one that fails to load cancels the edit and tells the writer (`mathFieldUnavailable`, a new label), keys that reach the document before the field has loaded leave the selected math as it is, and moving the selection off the math before then ends the edit. The layout rules' sizes and the engine's typography now load with the text layout engine rather than with the editor.
