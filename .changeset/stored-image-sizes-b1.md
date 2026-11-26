---
'@flamboyantengineer/document-editor': minor
---

Every image the editor makes now carries its size. Pasted, dropped and uploaded images get their natural size before upload, from the file's own bytes or else from the image the browser decodes from it. A file that gives no size either way is refused, and the new `imageUnreadable` label names it. An image typed in by address gets its size once it loads, and the dialog shows `addressUnreadable` when it cannot be read. A new figure takes its section's default width, with its height in the image's proportions.

Breaking changes for hosts:

- `FoundAsset.width` and `FoundAsset.height` are now required.
- `StoredDiagram.width` and `StoredDiagram.height` are now required.
- `DiagramAdapter.edit` takes the new `DiagramRef`, which is the asset and snapshot without a size.
- `insertTemplateImage` needs the asset's size.
