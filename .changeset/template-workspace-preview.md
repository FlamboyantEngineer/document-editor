---
'@flamboyantengineer/document-editor': minor
---

The template workspace is laid out as a band of tabs (the document's settings and one per template section) with the template actions, the preview beside a side panel of properties and saved versions, and an open dialog that lists templates in folders. Without `renderPreview` it draws its own preview, `TemplatePreviewEditor`, which shows the tab's section and then the sample, edits headers, footers and section parts in place, and keeps a template's own toolbar (`TEMPLATE_PREVIEW_TOOLBAR`), status bar (`TEMPLATE_PREVIEW_STATUS_BAR`) and zoom levels. A new toolbar item, `image-asset`, places one of the host's images as a template image (`insertTemplateImage`). `templatePreviewDocument` takes a `scope`, and `templatePreviewLockOf` locks what a preview shown in parts keeps read-only. Change bars are measured again when the editor resizes.
