# Entry Points

The package has one entry for the browser editor, three entries a server imports (the document model, the operations on whole documents, and the host contracts) and the shared-room entry, whose conversion a room server runs. The server entries read no DOM when they load, so a service reads, checks and changes the documents the editor makes without a browser.

## DOCE-ENTRY-1 - Server entries

### DOCE-ENTRY-1.1 - Document operations

`@flamboyantengineer/document-editor/document` shall export the operations that need no editor view: `compareVersions`, `mergeDocuments`, `diffText`, `listSuggestions`, `decideSuggestions`, `referenceTargets`, `updateReferences`, `documentOutline`, `headingSectionSpan`, `assignElementIds`, `repairElementIds`, `applyEdits`, `describeBlocks` and `syncTemplateSections`; the operations on stored documents `applyStoredEdits`, `describeDocument` and `AUTOMATION_SCHEMAS`, `runStoredScripts` and the script builders (`buildScriptHeading`, `buildScriptList`, `buildScriptParagraph`, `buildScriptTable`, `buildScriptText`); and the stored-file readers `findStoredElement`, `storedCitations`, `threadAnchors`, `decideStoredSuggestions`, `documentTargets`, `replaceTemplate`, `validateRequiredSections`, `storedDocumentText`, `storedEmbeds`, `storedContributors`, `updateStoredThreads` and `authoredContent`; all with their types. They shall work on a document read with `./model` in a process with no DOM.

Implementation: `src/document/index.ts`, `package.json`
Verification: `test/node-entry.test.ts`

### DOCE-ENTRY-1.2 - No DOM on import

`./model`, `./document` and `./host` shall import in Node with no `document` or `window` global, and none of them shall define one.

Implementation: `src/model/index.ts`, `src/document/index.ts`, `src/host/index.ts`
Verification: `test/node-entry.test.ts`

### DOCE-ENTRY-1.3 - Room conversion on a server

`@flamboyantengineer/document-editor/collab` shall import in Node with no `document` or `window` global, and its `documentToYjs` and `yjsToDocument` (DOCE-COLLAB-6.2) shall seed a room from a document read with `./model` and read it back there.

Implementation: `src/collab/index.ts`, `package.json`
Verification: `test/node-entry.test.ts`
