---
'@flamboyantengineer/document-editor': minor
---

Diagram… opens the host's diagram editor directly and inserts its first save as a figure, with later saves pinned through `options.onSave` (`pinFigureSnapshot`). The `assets` adapter gains `maxUploadBytes`, and `upload(file, signal, { current })` names the asset an upload replaces. Pasted images are all or nothing: one failure, an oversized file or a document changed meanwhile pastes nothing and says why.
