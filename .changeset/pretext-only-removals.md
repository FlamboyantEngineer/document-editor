---
'@flamboyantengineer/document-editor': minor
---

The pages measure nothing in the browser any more: the layout engine sizes every block, and nothing is laid out again because something finished drawing.

- Removed: `measureChildBlocks`, `MeasureOptions`, `createMeasureCache`, `MeasureCache`, `measureFootnotes`, `MeasureInput` and `LayoutRule.measure`, the measure-cache counts in `PaginationStats` (`cacheHits`, `cacheMisses`, `blocksDrifted`), the text engine's `measureIn`, `onAtomsSettled` and `scale` options, its `provisional()` (replaced by `mathPending()`), and the `de-remeasure` event.
- `FootnoteArea` and `footnoteAreaHeight` are exported from the pagination entry.
- Content the engine cannot lay out (a kept node the schema does not know, a host-drawn view, an inline node nothing sizes, math without a layouter) takes no room and is listed in `stats().textLayout` (`refused`, `reasons`, `refusedNodes`).
- The math layouter's glyphs are waited for before the first layout, so equations are never laid out twice.
- Without host layout rules the engine uses the built-in `LAYOUT_RULES`.
- `PagesLayout.provisional` now only means the layout has not settled yet.
