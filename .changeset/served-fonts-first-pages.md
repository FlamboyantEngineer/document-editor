---
'@flamboyantengineer/document-editor': minor
---

The first pages no longer wait for the host's `fonts.load`: the editor still asks it to load the template's families, but lays the pages out as soon as the served font files and the engine are ready. A family the host cannot load only shows the missing-fonts warning, so the `fontsFailed` label is removed.
