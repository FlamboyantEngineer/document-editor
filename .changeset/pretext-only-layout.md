---
'@flamboyantengineer/document-editor': minor
---

The pages are always laid out with the layout engine: the editor's `textLayout` option is removed. A host that shows pages passes a `fonts` adapter with `shaper` (harfbuzzjs's `harfbuzz.wasm`) and `files` (the template's faces). Without them, or when they fail or no face can be read, the editor shows the document in the web layout, in fallback fonts, with a banner saying the pages cannot be laid out and why (`data-text-layout-reason`). The template workspace takes the host's fonts adapter as `pageFonts`, for its own preview's pages. Layout rules handed in again now lay out again the sections the engine laid out.
