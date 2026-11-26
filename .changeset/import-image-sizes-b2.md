---
'@flamboyantengineer/document-editor': minor
---

Imported images now come with their size.

- `readDocx` takes a picture's size from its drawing extent. If there is none, it uses a legacy VML picture's style, and failing that the image's own bytes. A picture none of these sizes is left out with an `image-left-out` warning.
- `readMarkdown(markdown, options)` takes an image's size from the bytes of a data address, or else from the new `options.imageSize(src)`. An image neither sizes is left out with a warning.
