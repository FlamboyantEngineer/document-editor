---
'@flamboyantengineer/document-editor': patch
---

The text layout engine puts a line's baseline where Chromium does. For unhinted text, as the pages draw theirs, a pixel moves from a font's ascent to a descent that rounding shortened at every device pixel ratio. Half the leading above the font is truncated to whole device pixels rather than to the layout unit. Lines beside a broken image's alt text are no longer planned a pixel taller than drawn. A new `hinted` option of `createTextLayout` is for labs that draw hinted text.
