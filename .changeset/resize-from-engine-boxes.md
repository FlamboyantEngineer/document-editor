---
'@flamboyantengineer/document-editor': patch
---

Resizing takes its numbers from the layout engine rather than the drawn element: leaving the fit to the page width, dragging a column or row border, equal rows and the resize dialog store the same sizes at every zoom and device pixel ratio. A dragged row's stored height is its content's, so the row is drawn at the height it was shown at.
