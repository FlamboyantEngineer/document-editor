---
'@flamboyantengineer/document-editor': minor
---

The editor traces how it opens through the host's telemetry: the time to mount its view and its pages (`EDITOR_MEASURES.mountView`, `mountPages`), each layout counted under `EDITOR_LAYOUT_PASS` with its cause (`open`, `edit`, `reflow`) and pass number, and, with `createDocumentEditing(schema, { telemetry })`, the time each plugin group took to build.
