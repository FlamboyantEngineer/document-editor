---
'@flamboyantengineer/document-editor': patch
---

The pages' measuring element publishes `--de-measure-zoom`, the inverse of the device pixel ratio, which the reference stylesheet zooms it by, and every size measured there is divided by the zoom the browser draws it at. Figures, tables, code, equations and contents lists then measure the same on every screen, so the planned pages no longer depend on the device pixel ratio.
