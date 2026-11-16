---
"@flamboyantengineer/document-editor": minor
---

Pagination measures again only what really changed size: a block whose element grows or shrinks after it was measured (a late node view or style) is forgotten alone through a resize observer, an image load or remeasure event lays nothing out when its block kept its height, a hidden (zero-width) editor keeps its measurements, a loading image with a fixed box no longer makes its block provisional, lazy images in the measuring view load at once, an unsized inline SVG figure is drawn at the size it states, and a block drawn as no element is laid out one line tall. `PaginationStats` gains `blocksDrifted`.
