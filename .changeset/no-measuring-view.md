---
'@flamboyantengineer/document-editor': minor
---

The pages no longer render the document a second time out of sight: they are laid out from a state of the canonical document with no view, so the editor holds one rendering of it. `mountMeasuringView`, `MeasuringView` and `MeasuringViewOptions` are removed; a projection's `measureIn` becomes `element` (an element of the document the pages show in, which `createProjectionView` takes from `mount`), `ghostPlugins` becomes `layoutPlugins`, `mountGhost` goes, and `nodeViews` moves to `createProjectionView`. `layoutDocument` takes a state in place of a view. The `debug.measure` pane, `data-debug-measure`, the `de-document-editor__measure` slot and `--de-measure-zoom` are removed, and a change of device pixel ratio no longer lays the pages out again.
