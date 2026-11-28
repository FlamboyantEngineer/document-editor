---
'@flamboyantengineer/document-editor': minor
---

The editor's initial code is smaller. The field that edits an equation's source in place, with the code editor it is built on, now loads the first time a writer edits an equation, and `preloadEditorSurfaces` can warm it as the `math` surface. The layout rules' sizes and the engine's typography now load with the text layout engine rather than with the editor.
