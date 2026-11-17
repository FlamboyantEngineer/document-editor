---
'@flamboyantengineer/document-editor': minor
---

The scroll overview now keeps the frame's native scrollbar. The editor measures its marker layers into content ranges and hands them to the base library's `ScrollRegion` (`overviewLayers`), which paints them beside the scrollbar as a decoration. The custom `ScrollOverview` control and its `de-document-editor__overview` slot are gone.
