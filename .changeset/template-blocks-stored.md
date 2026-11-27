---
'@flamboyantengineer/document-editor': minor
---

A template block now stores what its markup rendered as its own blocks, which the pages lay out and split like any other content, instead of a `renderedHtml` attribute drawn by a node view and measured as drawn. A writer's change to the stored texts, or to a block's markup or keys, renders it again in the same edit; opening a document, another writer's change, reading and suggesting render nothing. The writer cannot edit inside a template block, and Backspace and Delete beside one select it whole. `createDynamicTemplates` takes `{ enabled }`; `renderTemplateBlock` gives the blocks as a ProseMirror fragment; `renderTemplateBlocks(tr, document)` renders a document's template blocks; `refreshDynamicTemplates` is removed. Markdown writes a template block's stored blocks. The stored `templateBlock` holds its blocks as `content`.
