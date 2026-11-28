---
'@flamboyantengineer/document-editor': minor
---

A layout whose page count, as a "page X of Y" footer shows it, still moves after its last pass now says so through `onUnsettled`, as a list of contents' digits already did. The projection's stats count such layouts (`unsettled`), and the editor counts them to the host's telemetry as `document-editor.layout-unsettled`.
