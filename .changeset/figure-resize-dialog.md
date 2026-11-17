---
'@flamboyantengineer/document-editor': minor
---

A figure's context menu offers `Resize…`, which opens its own resize dialog (`data-dialog="figure-size"`): width and height in whole pixels of at least 1, the width up to the page content width, with the reason for a refused size shown and Apply disabled; applying leaves the fit to the page's width (`setFigureSize`). The figure dialog drops its size and alignment fields and previews the image (`de-figure-preview`). Choosing an alignment after the fit keeps the fitted size, and choosing the checked alignment again clears it back to the template's. Figure labels move to `FigureLabels`.
