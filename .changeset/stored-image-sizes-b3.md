---
'@flamboyantengineer/document-editor': minor
---

Every figure and image holds its width and height. The schema requires a positive `width` and `height` on figures and `templateImageWidth` and `templateImageHeight` on images, with no default; the 160 by 96 template image size is gone. `readDocumentFile` reports an image or figure stored without its size (`figure has no width or height`) and reads past it as past any node it cannot read, and pasted markup without a size reads as no image. The pages size an inline image from its stored size (`imageBox`, a built-in layout rule) and a figure from its own, a figure or image wider than its place narrowed and scaled whole, its height in its proportions. `insertFigure` needs a `width` and a `height`, `buildScriptFigure` takes a `height`, and `createFigureDefaults` no longer gives unsized figures a width.
