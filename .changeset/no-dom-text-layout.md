---
'@flamboyantengineer/document-editor': minor
---

The pages have one text layout, the engine's, so the `TextLayoutMode` type is removed and the layout no longer takes a `textLayout` mode: it lays the pages out whenever the host's fonts are served. The root's `data-text-layout` still says `pretext` on pages and `dom` in the web layout. The zoom and margin helpers of the removed measuring view (`measure-scale`) are gone; the engine keeps margins to the layout unit itself.
