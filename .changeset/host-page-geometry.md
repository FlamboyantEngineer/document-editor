---
'@flamboyantengineer/document-editor': minor
---

Hosts that draw beside the content can find where to draw: the handle's `visiblePages()` gives each page on screen with its sheet and content boxes, each `VisibleElement` names the page of each of its boxes, and `onChangeBarsChange` also reports the bars the simple markup draws beside blocks holding suggestions. The view-only decoration helpers (`viewOnlyInline`, `viewOnlyNode`, `viewOnlyWidget`, `VIEW_ONLY_ATTRIBUTE`) are exported, so a host's own decorations can stay out of print snapshots.
