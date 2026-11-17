---
"@flamboyantengineer/document-editor": minor
---

Scripts run only when asked: opening a document runs none (its stored refresh policy is kept but inert, and the `open` run purpose and `runOpeningScripts` are removed); the editor only checks outputs for stale inputs as a document opens. One run goes at a time: another rejects with a `ScriptsBusyError` and the run entries wait, saying why. A run drops answers whose inputs key moved while it ran, and all of them once the view is read-only or shows another document. An identical output keeps the provenance its block records, with no change. Provenance and signatures keep the host's own fields. Failed blocks show their runner's message, empty ones say they produced nothing, and the editor shows a busy banner while scripts run and a "Script error:" banner after a failure. Automatic reference refresh leaves references in script output as produced.
