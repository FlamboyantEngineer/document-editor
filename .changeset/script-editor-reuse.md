---
"@flamboyantengineer/document-editor": minor
---

The script editor is exported (`ScriptEditor`, `useScriptCheck`) for a host's own scripts. Its source wraps long lines until switched off, its preview shows the output in the section of its block, drawn by the editor's node-view plugins and the host's `nodeViews`, stays mounted while the Reference tab shows, cannot run while the check finds an error, and stops its run when the script changes. A runner's `check` is told the block and the document (`ScriptCheckContext`), and `standardVocabulary: false` leaves the standard names out of the editor.
