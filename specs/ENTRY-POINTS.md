# Entry Points

The package has one entry for the browser editor, three entries a server imports (the document model, the operations on whole documents, and the host contracts) and the shared-room entry, whose conversion a room server runs. The server entries read no DOM when they load, so a service reads, checks and changes the documents the editor makes without a browser.

## DOCE-ENTRY-1 - Server entries

### DOCE-ENTRY-1.1 - Document operations

`@flamboyantengineer/document-editor/document` shall export the operations that need no editor view: `compareVersions`, `mergeDocuments`, `diffText`, `listSuggestions`, `decideSuggestions`, `referenceTargets`, `updateReferences`, `documentOutline`, `headingSectionSpan`, `assignElementIds`, `repairElementIds`, `applyEdits`, `describeBlocks` and `syncTemplateSections`; the operations on stored documents `applyStoredEdits`, `describeDocument` and `AUTOMATION_SCHEMAS`, `runStoredScripts` and the script builders (`buildScriptHeading`, `buildScriptList`, `buildScriptParagraph`, `buildScriptTable`, `buildScriptText`); and the stored-file readers `findStoredElement`, `storedCitations`, `threadAnchors`, `decideStoredSuggestions`, `documentTargets`, `replaceTemplate`, `validateRequiredSections`, `storedDocumentText`, `storedEmbeds`, `storedContributors`, `updateStoredThreads`, `authoredContent` and `storedOutline`; the table builder `tableFromRows` (DOCE-TABLES-4.1); the static renderer `writeStaticHtml` (DOCE-FORMAT-6.4); all with their types. They shall work on a document read with `./model` in a process with no DOM.

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

### DOCE-ENTRY-1.4 - No editor view on a server

`./model`, `./document` and `./collab` shall load no package that draws the editor: not React, React Aria, the React ProseMirror view or react-reconciler, and not `@flamboyantengineer/ui-components/rich-text-editor`. The schema builds its kit through `@flamboyantengineer/ui-components/rich-text-editor/kit`, which loads only the ProseMirror model, so a server installs and loads the engine packages alone.

Implementation: `src/model/schema/document-schema.ts`
Verification: `test/node-entry.test.ts`

### DOCE-ENTRY-1.5 - Optional reference presentation

The package shall expose `./reference.css` as an explicit opt-in stylesheet, using `document-reference` cascade layers for the neutral document and editor chrome partials from the labs. Its package files shall include those partials without the lab page layout. CSS shall be declared a package side effect so an explicit import survives bundling. Library source and JavaScript entry points shall remain hooks-only and import no styles. Consumers load the base controls reference stylesheet separately when desired.

Implementation: `package.json`, `reference.css`, `labs/reference/document.css`, `labs/reference/editor-chrome.css`
Verification: `test/reference-stylesheet.test.ts`

### DOCE-ENTRY-1.6 - Optional shadcn/ui presentation

The package shall expose `./shadcn.css`, loaded instead of `./reference.css` after the base controls' shadcn/ui stylesheet (`@flamboyantengineer/ui-components/shadcn.css`): the same document and editor chrome partials, unchanged, in the `document-reference` layer, then the editor's shadcn/ui retouch `labs/shadcn/editor-chrome.css` in the `document-shadcn` layer above it (DOCE-LABS-1.7). Its package files shall include the retouch without the lab page layout, and it shall import neither base library stylesheet.

Implementation: `package.json`, `shadcn.css`, `labs/shadcn/editor-chrome.css`
Verification: `test/reference-stylesheet.test.ts`

## DOCE-ENTRY-2 - Browser entry size

### DOCE-ENTRY-2.1 - Consumer bundle budgets

`npm run check:bundle-size` shall bundle a small matrix of consumers of the built `.` entry under production webpack, with React and its runtime external as a host provides them: `DocumentEditor` alone, `DocumentEditor` with `DocumentSidePanel` and `DocumentCommentsPanel`, and `TemplateWorkspace`. It shall measure each consumer's initial code, every file that loads with the entry, raw and gzipped, compare it with the reviewed baseline in `scripts/bundle-budgets.json`, and fail a consumer that grew by more than the file's allowance (the larger of 5% and 2 KB), or that no longer holds the module it is named for, so a broken measurement fails. `--update` rewrites the baselines. While the budgets file holds a suspension with its date and cause (`suspended`), a consumer that grew past the allowance shall be reported with its sizes and shall not fail; a consumer without a budget, a budget without a consumer and a broken measurement fail as before, as do the surfaces of DOCE-ENTRY-2.2. The file holds one since 2026-11-23 (Charles: the limits are skipped while both text layouts ship, and assessed again after the DOM text layout is removed and the bundles have had an optimization pass); ending it removes the entry and rewrites the baselines. `npm run check` runs it after the build and prints its report, every consumer's sizes, whether it passes or fails, so hosted CI checks every pull request and its log holds the sizes.

Implementation: `scripts/check-bundle-size.mjs`, `scripts/bundle-budgets.json`, `scripts/lib/bundle-budgets.mjs`, `scripts/check.mjs`
Verification: `test/bundle-budgets.test.ts`

### DOCE-ENTRY-2.2 - Surfaces loaded on first use

The editor shall load the surfaces few sessions open the first time one opens, not with the entry: the figure, reference, abbreviation, script and linked code dialogs, with the asset picker and file upload only the figure dialog uses, the image asset button's picker (DOCE-TEMPLATE-EDITOR-3.17), the symbol picker's character grid, KaTeX and the shared-room code. Nothing shows while a surface loads, and it takes focus as it would have had it been loaded. `npm run check:bundle-size` fails an editor consumer whose initial code holds any of them.

Implementation: `src/components/document-editor/object-dialogs.tsx`, `src/components/document-editor/symbol-button.tsx`, `src/components/document-editor/template-image-button.tsx`, `scripts/check-bundle-size.mjs`
Verification: `test/bundle-budgets.test.ts`, `src/components/document-editor/object-dialogs.test.tsx`

### DOCE-ENTRY-2.3 - Warming the surfaces

`preloadEditorSurfaces(names?)` shall load the surfaces of DOCE-ENTRY-2.2 that the editor loads on first use (`LazyEditorSurface`: `figure`, `reference`, `abbreviation`, `script`, `linked-code` and `symbols`), those named or all, so a host can warm them once the editor is ready, such as from its idle callback, and they open without a wait. It resolves once each has loaded or failed; a surface that failed loads again when it opens. The math renderer loads inside the base library and is not one of them.

Implementation: `src/components/document-editor/lazy-surfaces.ts`, `src/components/document-editor/object-dialogs.tsx`, `src/components/document-editor/symbol-button.tsx`, `labs/src/host-panel.tsx`
Verification: `src/components/document-editor/lazy-surfaces.test.ts`

### DOCE-ENTRY-2.4 - A dialog that fails to load

A dialog of DOCE-ENTRY-2.2 whose code fails to load, as a dropped connection may make it, shall close and tell the writer through the host's `feedback` (`dialogUnavailable`), and load again the next time it opens rather than failing for good (`lazyDialog`).

Implementation: `src/components/document-editor/lazy-dialog.tsx`, `src/components/document-editor/object-dialogs.tsx`
Verification: `src/components/document-editor/lazy-dialog.test.tsx`

### DOCE-ENTRY-2.5 - The template workspace's surfaces

The template workspace shall load its own preview, with the document editor, and its open dialog's list of templates the first time each shows, not with the entry, so a host that draws its own preview never loads the editor; nothing shows while one loads. `npm run check:bundle-size` fails the workspace consumer whose initial code holds any of them.

Implementation: `src/components/template-workspace/workspace-parts.tsx`, `src/components/template-workspace/template-open-dialog.tsx`, `scripts/check-bundle-size.mjs`
Verification: `test/bundle-budgets.test.ts`, `src/components/template-workspace/template-workspace-layout.test.tsx`, `src/components/template-workspace/template-preview-editor.test.tsx`

### DOCE-ENTRY-2.6 - Sizes on record for what loads on first use

`npm run check:bundle-size` shall also measure, for the editor consumer, what two of its `import()`s fetch on first use, raw and gzipped, each file once: the text layout engine, which is in no consumer's initial code, and the measurer of a host's font files. It shall print them after the consumers' sizes, with no budget and no baseline, so each run's log holds them; a host supplies the shaper's WebAssembly, which is in no bundle. A named load that no `import()` requests any more shall fail, so a size does not leave the record unnoticed.

Implementation: `scripts/check-bundle-size.mjs`, `scripts/lib/bundle-budgets.mjs`
Verification: `test/bundle-budgets.test.ts`

### DOCE-ENTRY-2.7 - Packed client entry and UI peer

The browser entry shall export `DocumentEditor` and `TemplateWorkspace` from the packed package. The manifest shall require the base component library at the same exact Git commit used in development. `npm run check:consumer` shall install the packed editor with strict peers and load the client entry against that commit.

Implementation: `src/index.ts`, `package.json`, `scripts/check-consumer.mjs`
Verification: `test/node-entry.test.ts`
