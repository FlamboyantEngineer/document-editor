---
'@flamboyantengineer/document-editor': minor
---

Pasted images at web addresses that state no size are now sized and kept in an editor without `assets`, and when the paste also holds math copied as an image, which is pasted as math beside them. `FigurePasteOptions.assets` is optional and `figurePasteOptions` always returns options. The bundle size limits are enforced again, from the sizes measured after the DOM text layout's removal.
