# Labs

Labs are static demo pages that show each area of the editor with neutral sample documents. They are debugging and review pages, not package API. Each lab is a static file `labs/<name>.html` that loads the bundle `npm run build:labs` builds into `labs/build/<name>.js`, and `npm run serve:labs` serves them at `127.0.0.1`, starting at port 4183 or the port set by `LABS_PORT`.

## DOCE-LABS-1 - Pages

### DOCE-LABS-1.1 - Local start

`npm run labs` shall bring a checkout's labs up to date before serving them with the supplied server, passing its server options through: it runs `npm ci` when the dependencies are missing or `package-lock.json` changed since the last install, and `npm run build:labs` after an install, when the labs are not built, or when a lab source (the library and lab sources, the lab stylesheets `labs/reference.css`, `labs/shadcn.css`, `labs/lab-pages.css`, `labs/reference/`, `labs/shadcn/` and the package's `shadcn.css`, the installed dependencies, the package and TypeScript configuration and the labs build scripts) changed, was added or was removed since the last build. It leaves a `node_modules` linked from another checkout alone. `--dry-run` prints the steps it would run, or that the labs are up to date, without running them or serving.

Both lab launchers shall use the shared lab server to try successively higher ports when the starting port is busy and print the bound URL. An explicit `--port` sets the starting port. Playwright shall use `--strict-port` to require the configured address.

Implementation: `scripts/start-labs.mjs`, `scripts/serve-labs.mjs`, `playwright.config.ts`, `package.json`
Verification: `test/start-labs.test.ts`

### DOCE-LABS-1.2 - Lab toolbar

Every lab page and the lab index shall start with the lab bar of `@flamboyantengineer/ui-components/labs` (UIC-LABS-4), which stays at the top of the page as it scrolls, named Lab settings: on a lab page an All labs link back to the index and the lab's title (the page title without ` · Labs`), on the index the title Labs, then the bar's Stylesheet picker and Theme switch. Each page loads the bar from `labs/build/chrome.js` beside its own bundle, mounted with `mountLabBar` in a shadow root, so neither the chosen stylesheet nor the lab restyles it. Each lab still marks itself ready (`data-lab-ready` on the root) once it has rendered; the chrome marks only the index ready.

Implementation: `labs/src/chrome/mount.tsx`, `scripts/build-labs.mjs`, `labs/index.html`
Verification: `e2e/labs.spec.ts`

### DOCE-LABS-1.3 - Stylesheet

The Stylesheet picker (UIC-LABS-2.1) shall load, for Reference, the default, `labs/build/reference.css`, bundled from `labs/reference.css`: the base library's reference stylesheet, the document reference stylesheet `labs/reference/document.css`, the editor chrome `labs/reference/editor-chrome.css` and the lab pages' layout `labs/lab-pages.css`. For shadcn/ui it shall load `labs/build/shadcn.css`, bundled from `labs/shadcn.css`: the base library's shadcn/ui stylesheet, the package's `shadcn.css` (DOCE-ENTRY-1.6) and the same lab pages' layout. A classic script in each page's head (`labs/build/boot.js`) applies the choice with `bootLabSettings` before the body is parsed (UIC-LABS-2.5).

Implementation: `labs/src/chrome/boot.ts`, `labs/reference.css`, `labs/shadcn.css`, `labs/lab-pages.css`, `scripts/build-labs.mjs`
Verification: `e2e/labs.spec.ts`

### DOCE-LABS-1.4 - Theme

The Theme switch (UIC-LABS-2.2) shall write the theme to the root attribute the reader names. With the Reference stylesheet, everything around the pages (the page background, text, side panels, lists and comment cards) follows the theme's reference tokens, while the pages stay paper: dark text on white.

Implementation: `labs/reference.css`, `labs/reference/document.css`
Verification: `e2e/labs.spec.ts`

### DOCE-LABS-1.5 - Remembered settings

The settings shall be read and remembered as UIC-LABS-2.3 says, in the browser's local storage (`labs/src/chrome/storage.ts`), a page whose storage is refused using the defaults. The index carries the settings into its links to each lab, and a lab's All labs link carries them back.

Implementation: `labs/src/chrome/storage.ts`, `labs/src/chrome/mount.tsx`
Verification: `e2e/labs.spec.ts`

### DOCE-LABS-1.6 - Selectors that stay local

The reference stylesheets and the shadcn/ui retouch shall never make `body`, `html`, `:root` or a compound with no type, class or attribute the subject of `:has()`, so a change inside the editor never makes the browser restyle the whole page.

Implementation: `labs/reference/document.css`, `labs/reference/editor-chrome.css`, `labs/shadcn/editor-chrome.css`
Verification: `test/reference-stylesheet.test.ts`

### DOCE-LABS-1.7 - The shadcn/ui stylesheet

With the shadcn/ui stylesheet, the editor's chrome shall read as shadcn/ui in both themes, under the page's shadcn/ui tokens (light and dark under `.dark` or `data-theme`): the editor's frame a rounded card with a hairline ring, the menubar, toolbar, find bar and status bar on the page's background, the side panels on the sidebar surface with their muted tab list, the comment cards beside the pages as cards with a hairline ring and a small shadow, and the pages on the muted surface. The editor's chrome (the document editor, the template workspace and the template editor) takes the compact control scale, the heights and type a `data-ui-scale="compact"` container takes under the base sheet. The pages themselves keep the template's look: dark text on white paper. Every lab but the stress labs shall pass an axe scan with no serious or critical violation under it, in light and in dark.

Implementation: `shadcn.css`, `labs/shadcn/editor-chrome.css`, `labs/shadcn.css`
Verification: `e2e/a11y.spec.ts`, `e2e/labs.spec.ts`

## DOCE-LABS-2 - Stress labs

### DOCE-LABS-2.1 - Stress documents

The stress labs shall show a generated document, the same on every load, in the document editor with its toolbar, status bar and scrolling frame, proofed by a word-list proofer and completed inline by a provider that offers the same words after every pause, filling the window below their controls: `stress-long`, a very long document of varied content (headings at three levels, text with footnotes, nested lists, tables, code, quotes and rules after a table of contents) in sizes up to a few hundred pages; `stress-tables`, many kinds of tables (small, wide, tall across pages, merged cells, sized columns, long cell text, back to back and in runs) in sets; and `stress-pagination`, the cases pagination finds hardest (a paragraph, a code block, a list and a quote longer than a page, a run of headings, many and long footnotes on one page, page breaks in a row, empty paragraphs, a table row taller than a page and many short blocks). Every page holds its content.

Implementation: `labs/src/stress/stress-documents.ts`, `labs/src/stress/stress-lab.tsx`, `labs/src/stress-long.lab.tsx`, `labs/src/stress-tables.lab.tsx`, `labs/src/stress-pagination.lab.tsx`
Verification: `e2e/stress.spec.ts`

### DOCE-LABS-2.2 - Layout times

A stress lab shall report how many text blocks its document holds and how long its pages took to lay out, from the start and from the latest edit, and build a larger document from its size picker.

Implementation: `labs/src/stress/stress-lab.tsx`
Verification: `e2e/stress.spec.ts`

### DOCE-LABS-2.3 - Budgets

`npm run test:perf` shall measure the performance budgets on the scale lab (`e2e/performance.spec.ts`, run apart from `npm run test:labs` as the `budgets` project), with the browser's own counters (`Performance.getMetrics`, a trace's restyled elements) and the pagination's (`layoutStats`), and report each metric beside its target and whether it meets it, as a table and in `test-results/performance.json`. The typing budgets on 40 and 300 pages, the remote typing budget and the remote typing budget while changes show (`?compare` on the scale lab) are enforced: each is measured on every key's own work (`keystrokeWork`), from the key's press until its input is handled and from the start of the frame that draws it until that frame is drawn, without the wait for that frame, and a test fails on a missed one; remote typing is measured from a remote writer's keystroke reaching the editor, one every 100 ms into the middle of the document, to the frame after it is drawn, since remote changes repaint at once with no fixed tick. The typing on 40 and 300 pages is measured and enforced on the layout engine's pages (DOCE-PAGINATION-11.5). The style scope's check counts the elements Enter restyles on 5 and 40 pages to show the trace counts: a typed key restyles none, since the keys put back text deleted first and the block keeps its height. The other budgets are targets until the pagination phase ends: the harness records and does not fail on a missed one. Time budgets are measured on the development machine; counter budgets do not depend on it.

| Budget                                              | Metric                                                                                                                                                                                           | Target                                   |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| Single section, 5000 blocks                         | Pages; first settled time                                                                                                                                                                        | ≥ 300 pages; the time is recorded        |
| Multi-section, 25 × 200 blocks                      | After an edit mid-document: layouts until settled; template regions drawn again; sections reused per layout (`sectionsReused`)                                                                   | ≤ 4; ≤ 24; ≥ 23 of 25                    |
| Remote keystroke, 1600 blocks                       | Per keystroke: sections relaid (`sectionsRelaid`); blocks measured (`blocksMeasured`)                                                                                                            | ≤ 1; ≤ 5                                 |
| Suggested keystroke, link and decision, 1600 blocks | Per step, a remote suggestion typed inside a line, its thread named on it, and its acceptance: sections relaid; blocks measured                                                                  | ≤ 1; ≤ 5                                 |
| Wheel scroll                                        | Browser layouts per wheel event, on 5 and 40 pages                                                                                                                                               | ≤ 3, no growth with the pages            |
| Typing style scope                                  | Elements restyled per keystroke, 40 pages against 5                                                                                                                                              | ≤ 3 times                                |
| Keystroke latency                                   | p95 of each key's own work, on 40 and 300 pages (enforced)                                                                                                                                       | ≤ 16 ms; ≤ 32 ms                         |
| Remote typing                                       | p95 from a remote keystroke reaching the editor to the frame after it is drawn, on 300 pages (enforced)                                                                                          | ≤ 32 ms                                  |
| Typing while changes show                           | With the document compared with itself as opened, shown as change bars, on 300 pages: p95 of each key's own work (recorded); p95 of a remote keystroke to the frame after it is drawn (enforced) | ≤ 32 ms; ≤ 32 ms                         |
| Typing beside comment threads                       | p95 from a key's press to the frame after it is drawn, on 300 pages beside 500 open comment threads                                                                                              | ≤ 32 ms                                  |
| Load, 24 pages                                      | `whenSettled` time from navigation over five loads: median, p95                                                                                                                                  | ≤ 6 s; ≤ 12 s                            |
| Workload load, 18 and 40 pages                      | `whenSettled` time from navigation, median of five loads with the cache cleared (cold) and of five reloads                                                                                       | ≤ 2.6 s and ≤ 2.2 s; ≤ 4.5 s and ≤ 4.0 s |

A text-only change shall walk no section it does not change, through every editing plugin: a plugin that follows changes reads only the nodes they reached (`changedNodes`), each changed range mapped only through the later steps that move positions, so a transaction of many attribute or markup steps, such as giving every element of a long document its id, is not mapped once per pair of steps, and paragraph numbering keeps its numbers, moved with the change, when typing leaves every paragraph with or without its numbering content. A unit test fails on any walk of an untouched section's children, descendants or a range of them.

Implementation: `e2e/budgets.ts`, `e2e/performance.spec.ts`, `labs/src/stress/stress-probe.ts`, `playwright.config.ts`, `package.json`, `src/utils/changed-ranges.ts`, `src/engine/paragraph-numbering.ts`, `src/engine/scripts.ts`, `src/engine/table-width.ts`
Verification: `e2e/performance.spec.ts`, `src/engine/text-change-locality.test.ts`, `src/engine/paragraph-numbering.test.ts`, `src/utils/changed-ranges.test.ts`

### DOCE-LABS-2.4 - Scale lab

The `stress-scale` lab shall show the documents the budgets name, picked by its size picker or the page's `size` query parameter: about 5, 24, 40 and 300 pages in one section, one section of 5000 blocks, 25 sections of 200 blocks, 1600 blocks in eight sections, about 300 pages beside 500 open comment threads, and about 100 pages of short lists (a paragraph and a list of eight items or fewer each, ordered and bulleted in turn, some nested), to profile list pagination apart from long lists, each the same on every load; on the layout engine's lines (DOCE-PAGINATION-11); and offer a remote writer typing into the middle of the document (Remote typist). Each stress lab shows the harness its editor's layout state and counters, when its pages first settled, and a way to type as a remote writer, a character at a time or up to the end of a line (`window.stressLab`).

Implementation: `labs/src/stress-scale.lab.tsx`, `labs/stress-scale.html`, `labs/src/stress/scale-documents.ts`, `labs/src/stress/stress-probe.ts`, `labs/src/stress/stress-lab.tsx`
Verification: `e2e/stress.spec.ts`, `e2e/performance.spec.ts`, `e2e/regression.spec.ts`

### DOCE-LABS-2.5 - Counter budgets

The budgets counted in layouts, sections, blocks and restyled elements rather than time do not depend on the machine, and `npm run test:labs` shall hold them on every pull request, measured as the harness measures them (`e2e/budgets.ts`): after an edit in the middle of 25 sections, at most four layouts and 24 template regions drawn again, and at least 23 sections reused per layout; a remote keystroke that starts a new line in 1600 blocks relays at most one section and measures at most five blocks, and one inside a line lays nothing out; at most three browser layouts per wheel event on 5 pages and on 40; at most 8 page boxes read per wheel event on 5 pages and 12 on 40 to tell the page in view, which a scan of every page would exceed; and a keystroke that keeps its block's height on 40 pages restyles at most three times as many elements as on 5, and keeps the height, and an Enter there restyles at most 800 elements; opening 24 pages settles in at most two layouts, measures each block once, and lays out nothing in the second after. A budget not met yet is an expected failure naming its gap in the port plan.

Implementation: `e2e/budgets.ts`
Verification: `e2e/budget-counters.performance.spec.ts`

### DOCE-LABS-2.6 - Budgets with the layout engine

On the scale lab's 300 pages, by the median of three rounds, the layout engine shall settle the first layout within 11 seconds, and settle an Enter within 250 ms, an insert of about 3,400 characters as a paste gives within 400 ms, and eight lines selected and deleted within 450 ms, each near the document's start, from the key's press to the pages settled with its change laid out; and typing far down the document, after a scroll to about its 270th page, shall keep each key's work at p95 within the 300-page typing budget (DOCE-LABS-2.3). The budgets are times of their own, not against the DOM's measuring, which goes once the engine is the only text layout. Each budget keeps the slowest of the CI timing job's recent readings at or under 60% of it, so a slow runner passes and a real slowdown fails; work that makes the engine faster lowers them. Three runs on 23 November 2026 read first settle 4,195, 5,855 and 6,078 ms, an Enter 99, 118 and 131 ms, the paste 198, 227 and 232 ms, the range deleted 194, 213 and 256 ms, and far typing at p95 18.1, 19.9 and 21.8 ms. The CI's timing job runs it after the other timing tests. The wait for the scale lab to be ready polls a plain function, not an expectation, since each failed poll of an expectation reads the page's accessibility tree, about a second of the page's own time on 300 pages, which the timings would count. On CI the test writes its medians as a notice, and into a file the timing job prints as its last step, so they are read from the run's annotations or the end of its log.

Implementation: `e2e/budgets.ts`
Verification: `e2e/text-layout.performance.spec.ts`

## DOCE-LABS-3 - Editor labs

### DOCE-LABS-3.1 - The template editor beside a document

The template editor lab shall show the template editor beside the document editor, a template inheriting from the base template, each change restyling the document at once. Host options mark the template as never saved, fail its parent's load, disable the editor, put a table in the header and footer, hide the scope picker (`showsScopePicker`) and leave the scope to the editor from the template's first section (`defaultScope`); a host's save says under the id field why a template without an id cannot be saved and focuses it (`idError`, `idInputRef`); the lab offers its own fonts and its own code fonts (`codeFonts`), shows the state of the editor's drafts as it reports it (`onDraftsChange`), reports section renames, and shows the template it holds as JSON, read only.

Implementation: `labs/src/template-editor.lab.tsx`, `labs/template-editor.html`
Verification: `e2e/template-editor.spec.ts`

### DOCE-LABS-3.2 - The full editor

The full editor lab shall show the document editor with every feature on, as a host assembles it: the comments margin over the in-memory host's comment store, suggest mode and how suggestions show, proofing with two proofers, find and replace, zoom, the toolbar, status bar and scrolling frame, the host's own toolbar items, context menu entries and locked paragraph, collaborators' carets, an agent working through the automation API, figures and linked code through the in-memory host's assets and code source, references and abbreviations through its citations and glossary, and the outline and search panels.

Implementation: `labs/src/full-editor.lab.tsx`, `labs/full-editor.html`
Verification: `e2e/full-editor.spec.ts`

### DOCE-LABS-3.3 - Host services mimicked in the page

The host services lab shall mimic in the page each host service that needs a backend, so a person can try it by hand: embedded content the host keeps (`EmbedSourceAdapter`), a table in the body and one in an appendix whose template section sets its own table colors, and one value inline in a heading, which the controls change, remove or deny at the host and the writer checks and takes in again; the host's variables in the page headers (`VariablesAdapter`), changed while the document is open; font loading (`FontsAdapter`) that is immediate, slow or failing; and logs of what the editor measured (`TelemetryAdapter`) and told the reader (`FeedbackAdapter`). The editor shows the host's zoom levels, symbols and code languages, and can be hidden (`active`). An embed can be pinned to the state it shows, and the context menu's host entries on an embed take its update, repin it or let it follow its content (`setEmbedPinned`, `ContextTarget.embed`); a range of a mimicked spreadsheet is embedded through the linked spreadsheet bridge (`createLinkedSpreadsheetAdapter`), and changed, recalculated or denied at the host; the editor waits for the fonts as long as its `fontTimeout` says, opened again to show the pages failing with `onLayoutFailed` logged; and the math typesetter can stop answering, so new math shows as invalid with the host's reason after the editing's `math.timeout`.

Implementation: `labs/src/host-services.lab.tsx`, `labs/src/host-data.ts`, `labs/src/host-embed-controls.tsx`, `labs/host-services.html`
Verification: `e2e/host-services.spec.ts`

### DOCE-LABS-3.4 - Import and export

The import and export lab shall read a word processing document, Markdown, HTML (pasted or from a file) or a stored document into the section of a template it picks, listing the reader's warnings and refusing an archive past the limits it sets, and write the open document, whole or one section, as Markdown (with its title, front matter, comments and suggestions), HTML, a word processing document or the stored format, with its suggestions accepted or rejected. The word processing reader's options are controls: captions typed as plain text, appendices into the template's appendix section (`findAppendixSection`), images given a host's upload placeholder (`imageSource`) and tracked changes and comments kept, and the composed document leaves out a title the cover already shows (`titleVariables`) and fits its tables inside an inset (`tableInset`); a sample word processing document built in the page has each of these. The lab makes a new document of the template (`createDocumentFile`, with a host's own list token in `contentsTokens`), lists its drift from the template, adds an empty appendix and takes empty appendices out (`removeEmptyTemplateSections`), reads HTML as a whole document (`readHtml`) and a stored file through `upgradeDocumentFile`, writes the comment threads into the word processing document, and offers File > Export's PDF entry (`pdfExport`) printed by a print service mimicked in the page with `printSnapshot` in a frame, which can fail, the editor's feedback shown. The templates lab checks a template file as a server does: upgraded (`upgradeTemplateFile`) and validated (`validateTemplateFile`) with each error naming its setting, then its required sections, the settings a root template leaves unset (`missingTemplateSettings`) and the keyed records a child inherits (`extensionRecord`).

Implementation: `labs/src/import-export.lab.tsx`, `labs/src/import-export-options.tsx`, `labs/src/lab-word-sample.ts`, `labs/src/lab-print-service.ts`, `labs/src/template-file-check.ts`, `labs/import-export.html`, `labs/templates.html`
Verification: `e2e/import-export.spec.ts`, `e2e/templates.spec.ts`

### DOCE-LABS-3.5 - Automation on stored documents

The automation lab shall mimic a host's server over the in-memory store: an agent, person or system reads the stored document and sends a batch of edits against the revision it read, directly or as suggestions, and the host saves the result and keeps the threads the batch opened. Another writer saving first makes the batch a conflict, and a locked section or text that moved refuses it. The host runs the document's scripts, accepts or rejects every suggestion, lists what changed since the save before and shows the JSON Schemas it offers an agent. The stored-file readers run on the stored document without an editor: the element with an id, the text, the citations, the reference targets, the required sections a stricter template lacks and the thread anchors; the host moves the document to that template and accepts one suggestion on the stored file. Its batches also replace and delete a block, set a block's attributes and insert a table of rows (`tableFromRows`); its tools check, break and repair the stored ids and copy the document (`checkStoredIds`, `assignStoredIds`, `copyDocumentFile`), change a thread's anchor (`updateStoredThreads`), accept a suggestion that records no writer crediting its thread's writer (`threadAuthor`), list the embeds, the writers, since the save before or all (`storedEmbeds`, `storedContributors`), read the outline and the authored content of a heading (`storedOutline`, `authoredContent`), and find the scripts whose output is stale (`findStaleStoredScripts`) under a runner with an inputs key. The lab's scripts build their output with the script output builders, a table among them. A static render shows the stored document as a standalone page in a frame (`renderPrintPage`), with its suggestions as the markup picked and its images from a print server's address (`resolveImage`), beside its content as HTML text (`writeStaticHtml`), the counters at each heading (`numberingCountersAt`), each table's caption line (`tableCaptionLineStyle`) and a server's checks of a Roman numeral, a glossary entry and a caption line (`parseRoman`, `isGlossaryEntryId`, `normalizeGlossaryInput`, `formatCaptionLineText`).

Implementation: `labs/src/automation.lab.tsx`, `labs/src/automation-stored.tsx`, `labs/src/automation-render.tsx`, `labs/src/lab-scripts.ts`, `labs/automation.html`
Verification: `e2e/automation-lab.spec.ts`

### DOCE-LABS-3.6 - Side panels

The side panels lab shall show the panel at the document's start controlled by the host (its selected pane, whether it shows and its width between a narrowest and widest, each change reported) or left to itself, remembering its pane, expanded state and width across reloads under a key through the page's storage; and the outline, search, properties and contributors panes on their own beside the document, the outline leaving out the title or collapsing the headings below a level. Its document ends in a nested heading longer than the widest panel, which the outline keeps on one line with its number leading, clipped at its end, and with no sideways scrolling, at the narrowest width and the widest.

Implementation: `labs/src/panels.lab.tsx`, `labs/panels.html`
Verification: `e2e/panels.spec.ts`

### DOCE-LABS-3.7 - Template content in place

The template content lab shall show a template's preview in parts beside the template as JSON: a read-only sample, then each template section's content and placeholder, edited in place with the toolbar and its variable menu, and the headers and footers, each edit written into the template. Its template sets caption and footnote typography, which a read-only appendix section overrides in part, citing a footnote and showing two narrow captioned tables, one aligned right, their captions centred.

Implementation: `labs/src/template-content.lab.tsx`, `labs/template-content.html`
Verification: `e2e/template-content.spec.ts`

### DOCE-LABS-3.8 - The template workspace

The template workspace lab shall show the template workspace over the in-memory host's template store: templates in folders, a pinned web-layout template, saves and conflicts, copies, deletes, history and restore, and the workspace's own preview beside the side panel. Host options let the host hold the template open and the version shown, as a route does (`templateId`, `revision`, `onTemplateIdChange`, `onRevisionChange`), picked with a template picker of the host's own (`TemplatePicker`) and shown as the route; start at a template's first version (`defaultRevision`); draw the host's own preview, which names the template, layout and scope it is handed (`renderPreview`); lay the parts out in the host's own frame, the properties and history side by side (`renderLayout`); start the side panel expanded (`defaultPanelExpanded`); and remember the pane shown under a key the host names, in the page's storage (`panelPersistKey`).

Implementation: `labs/src/template-workspace.lab.tsx`, `labs/template-workspace.html`
Verification: `e2e/template-workspace.spec.ts`

### DOCE-LABS-3.9 - Options a host sets on the editing, the schema and the editor

The editor options lab shall give a control for each option a host sets on the editing, the schema and the document editor, on a sample whose sections end with a table: a content limit (`limit`) whose words show against it in the status bar, with a collaborator's paragraph taking the document past it (`data-over`); a trailing paragraph (`trailingParagraph`); the typing shortcuts by group (`typingRules`); the host's layout rules on `DocumentEditor` keeping tables whole on a page (`layoutRules`); the host's schema options: a tooltip attribute, a mention class, the address a stored figure's asset is previewed at and the time the assets show as of, and an identity attribute, the review state of the element lifecycle recipe (docs/recipes/element-lifecycle.md), stamping new elements as drafts and freezing approved ones; a document opened with missing, invalid and repeated element ids, repaired on opening or not (`repairIds`); a dropped connection, through a service worker, failing the next dialog's code, which the editor reports through `feedback` and loads the next time; and a status item of the host's that reads a part of the editor's state (`useDocumentEditorState`) and draws only when that part changes.

Implementation: `labs/src/editor-options.lab.tsx`, `labs/src/editor-options-document.ts`, `labs/src/dialog-network.ts`, `labs/dialog-network-worker.js`, `labs/editor-options.html`
Verification: `e2e/editor-options.spec.ts`

### DOCE-LABS-3.10 - Comments with a host's options

The comments lab shall set, each with a control, what a host sets on the comments and the editor around them: the gap between a page and its cards (`cardGap`), the host's entries ending each thread's and suggestion's header menu (`threadActions`), deleting without asking (`confirmsDelete`), the text a reply starts with (`replyStart`), no active card once focus leaves (`clearsActiveOnBlur`), moderation (the in-memory store's `moderates` and the policy's `moderate`, from the page's `moderator` query, which its control reloads the page with), a side panel with the comments and contributors panes, which the threads reveal (`revealsPane`) and the handle reveals with `onShown`, collaborators' avatars and the contributors opening the host's own person cards (`renderCard`), and Copy link in the menu and its key (`onCopyLink`), with what the editor hands the host shown in a log. Its store wraps the in-memory host's with what a host's backend adds: an assistant writes a reply for the reader that stays pending until the lab finishes it or fails it, for the reader to retry or for good (`settleEntry`), each pending reply shown logged (`onActivityShown`), and another person typing in a thread (`subscribeActivity`). The document editor lab logs the person each mention names (`onMention`).

Implementation: `labs/src/comments.lab.tsx`, `labs/src/comment-host-options.tsx`, `labs/src/lab-comment-store.ts`, `labs/src/document-editor.lab.tsx`
Verification: `e2e/comments-host-options.spec.ts`, `e2e/document-editor.spec.ts`

### DOCE-LABS-3.11 - Contributor colours

The contributor colours lab shall show a document written by more writers than the default eight colour slots, with authorship shown, the contributors pane beside it and as many people present, each with a caret, and a choice of the editor's colour slots (8 or 50, DOCE-COLLAB-1.8). The lab's sheet colours as many slots as it sets, so with 50 every writer's text, caret and avatar has a colour no other writer has, and with 8 writers share them.

Implementation: `labs/src/contributor-colors.lab.tsx`, `labs/contributor-colors.html`
Verification: `e2e/contributor-colors.spec.ts`

### DOCE-LABS-3.12 - Host options in the full editor, history and session labs

The full editor lab shall offer the host's options for the document it shows: proofing turned off and on (`isEnabled`), the first check run when the host says (`scheduleFirstCheck`), the reader's decisions the host keeps and gives back on opening (`ignored`, `disabledRules`, `onDecision`), its own normalising of completion answers (`normalize`), a template pin given to scripts and exports (`templatePin`), a markup choice it turns off saying why (`markupReasons`), a link to one of its records inside a script's output that keeps the selection under a secondary click (`contextMenu.keepSelection`), a script runner that keys its inputs (`scriptInputsKey`), abbreviations brought up to date on opening (`refreshAbbreviationsOnOpen`), and Open again, which gives the editor the document anew for the options read on opening. Its document holds abbreviations with each issue (`createAbbreviationHealth`), math that does not typeset with the host's text for it (`invalidMath`), and tables, which the host may keep footnotes out of (`citingPlaces`); a review scope picks chapters, which the outline highlights with their subheadings (`documentOutline` highlights) and a host decoration marks over the text they head. The history lab shall offer viewing a version as it is picked (`viewOnPick`) and a hook that changes a named version before it is saved, or saves none (`beforeVersion`). The session lab shall open a document pinned to a template, the host saving a newer revision of it while it is open, and one out of step with its template, and set the draft delay (`draftDelay`), showing what the drafts adapter last did.

Implementation: `labs/src/full-editor.lab.tsx`, `labs/src/full-editor-options.tsx`, `labs/src/review-scope.tsx`, `labs/src/history.lab.tsx`, `labs/src/session.lab.tsx`
Verification: `e2e/full-editor-options.spec.ts`, `e2e/history.spec.ts`, `e2e/session.spec.ts`

## DOCE-LABS-4 - Regression labs

The pagination regression scenarios lay out the regression set's documents (`test/fixtures/documents/`) and check the pages a reader sees and the document the writer would store. A scenario the editor does not pass yet is an expected failure that names its gap in the port plan; it passes once that work lands, and its mark comes off then. The scenarios run with `npm run test:labs`, and on every pull request.

### DOCE-LABS-4.1 - The regression lab

The `regression` lab shall show a document of the regression set on its template's pages, the template resolved through the set's templates on the base template, in the document editor with its scrolling frame and status bar, picked by its Document picker or the page's `document` query parameter, in the web layout when the `layout` query parameter is `web`, and otherwise on the layout engine's lines (DOCE-PAGINATION-11), on a projection of the document (DOCE-PAGINATION-7.17), with quotes drawn by a host's React view, taller than the schema draws them, when it has a `hostViews` one. With a `compare` query it shows the changes since the document opened as change bars, and marked up in place, the deleted words where they were, with `compare=markup`. It holds every document of the set, and shows the layout debugging (each page's room, each block's planned height and top as `data-debug-height` and `data-debug-top`, DOCE-EDITOR-6.13, DOCE-PAGINATION-7.4) when it has a `debug` query. It shows the scenarios the document as it would be stored, puts a caret at a split block's fragment boundary, by the position the caret has once the pages are joined whole, gives the pages as a snapshot for printing (`snapshot`, DOCE-EDITOR-6.19), and gives the lines the engine computed for each page (`textLines`) and the forced blocks the browser drew on other lines (`wrappedLines`), and draws every page on the engine's lines (`drawAllLines`) (`window.regressionLab`). Every document lays out on pages that hold their content, as many as the status bar counts.

Implementation: `labs/src/regression.lab.tsx`, `labs/regression.html`, `labs/src/regression/regression-lab.tsx`, `labs/src/regression/host-quote-view.tsx`, `labs/src/regression/regression-documents.ts`, `labs/src/regression/regression-probe.ts`
Verification: `e2e/regression.spec.ts`, `e2e/print.spec.ts`, `e2e/text-layout.spec.ts`, `e2e/block-geometry.spec.ts`

### DOCE-LABS-4.2 - Edits at fragment boundaries

Typing and Enter on either side of a fragment boundary, Delete at a head fragment's end and Backspace at a continuation's start shall give the same stored document, element ids aside, whether the block is split across pages or shown whole in the web layout, for a paragraph, a list item, an ordered and a nested list, tables with a repeated header, one header and none, a code block and a quote; the pages still hold their content after the edit.

Implementation: `labs/src/regression/regression-probe.ts`
Verification: `e2e/regression.spec.ts`

### DOCE-LABS-4.3 - Lists

A long ordered list shall split between items, each item shown once and numbered on from page to page; a nested list and an item longer than a page split and show every stored item; and a split item's continuation draws no empty line where it opens. The regression set's `list-split-stress` document shall hold, before two sixty-item runways, four ordered lists: thirty items on one level, thirty items with two subitems each, two items with twenty subitems each, and twenty items with two subitems that hold one child each; it splits over pages and shows every item.

Implementation: `labs/src/regression/regression-documents.ts`
Verification: `e2e/regression.spec.ts`, `test/fixtures/documents/regression-set.test.ts`

### DOCE-LABS-4.4 - Tables

A long table shall split between rows, each body row on one page only, with its header rows on every page when its section repeats them, on the first page when it does not, and on none when it has none; a continuation without a repeated header repeats the caption; both header modes, merged cells and rich cells lay out.

Implementation: `labs/src/regression/regression-documents.ts`
Verification: `e2e/regression.spec.ts`

### DOCE-LABS-4.5 - Code

A 150-line listing shall split at line breaks, each line on one page only, each fragment numbering its lines on from the last; a quoted code block longer than a page splits inside its quote. The regression set's `code-block-stress` document shall hold linked code of one page, of a whole file, of a range starting at a three-digit line and of a range placed after prose so it splits mid-page, and short, long and long-row authored blocks; each long block splits with its fragments numbering on from its first line. Each fragment of split linked code shows one display with the block's caption, starts its gutter at its own first line, runs into the next fragment's range with no blank row at its end, and every fragment after the first is flagged continued; a selected fragment is drawn as before. A same-height edit in a middle code fragment measures that block alone and rebuilds no page. The regression lab resolves linked code to sample lines (`codeSource`), so the linked code dialog opens on any fragment.

Implementation: `labs/src/regression/regression-documents.ts`, `labs/src/regression/regression-code.ts`
Verification: `e2e/regression.spec.ts`, `e2e/linked-code-fragments.spec.ts`

### DOCE-LABS-4.6 - Quotes

A quote of twelve paragraphs shall split across pages, each paragraph shown once, and be stored as one quote of twelve paragraphs.

Implementation: `labs/src/regression/regression-documents.ts`
Verification: `e2e/regression.spec.ts`

### DOCE-LABS-4.7 - Headings keep with what they head

No page shall end with a heading; a heading keeps with at least two lines of the paragraph it leads, and with the first rows of the table it leads.

Implementation: `labs/src/regression/regression-documents.ts`
Verification: `e2e/regression.spec.ts`

### DOCE-LABS-4.8 - Corner cases

Every page break, two in a row included, shall start a new page; a paragraph longer than a page fills each page it runs over; every empty section has one page of its own; each footer shows its page's number and the page count; and a long mixed document lays out again on pages that hold their content after an edit and its undo, on as many pages as before.

Implementation: `labs/src/regression/regression-documents.ts`
Verification: `e2e/regression.spec.ts`

### DOCE-LABS-4.9 - Footnotes

Each footnote shall show on the page that marks it, in paragraphs, lists, table cells and quotes, and a template that numbers footnotes per page numbers each page's marks from 1, each entry with its mark's number.

Implementation: `labs/src/regression/regression-documents.ts`
Verification: `e2e/regression.spec.ts`

### DOCE-LABS-4.10 - Mixed geometry

Each section shall lay out on pages of its template section's size and orientation, in order (A5 portrait, US Legal portrait, A4 landscape); an appendix that restarts numbering numbers its first heading `A.` each time it repeats; Roman front matter numbers sixty headings `i.` to their last and their subheadings `i.a`; and one document numbers a Roman body and an alphabetic annex.

Implementation: `labs/src/regression/regression-documents.ts`
Verification: `e2e/regression.spec.ts`

### DOCE-LABS-4.11 - Template styles in the reference stylesheet

The reference stylesheet shall draw what a template sets as properties: table body rows in the odd and even row backgrounds; each caption's label and number in the caption label style and its text in the text style, each falling back to the other and then to the paragraph's; footnote entries in the footnote text style (colour, weight, style and alignment), the template's entry spacing apart, each number in the marker style followed by the numbering suffix; and each display equation's number at its line's end (DOCE-OBJECTS-1.10).

Implementation: `labs/reference/document.css`
Verification: `e2e/regression.spec.ts`, `e2e/template-content.spec.ts`

### DOCE-LABS-4.12 - Roman numbering

The regression set's `roman-numbering-coverage` document shall number lower-case Roman front matter (`i.`, `i.i`), an upper-case Roman body on three levels (`I.`, `I.1`, `I.1.i`) and an annex that starts again (`I-`, `II-`, `III-`); its ordered lists, nested ones among them, shall number in their section's Roman style, each on from its start, at the subtractive edges (3, 8, 38, 48, 98, 398, 498, 898, 998, 3,998), past 3,999 (3,999, 7,998, 12,000) and over pages in a 240-item list; its front matter shall list the chapters; and its figures, tables, code blocks and equations, listed on the annex's last page, shall number from 1 under each chapter (`I-1`, `II-1`) and again in the annex (`I.i`).

Implementation: `labs/src/regression/regression-documents.ts`
Verification: `e2e/regression.spec.ts`, `test/fixtures/documents/regression-set.test.ts`

### DOCE-LABS-4.13 - Caption numbering

The regression set's `caption-numbering` document shall hold captioned figures, tables, code blocks and equations in three numbering contexts, its own template (`regression-captions`) numbering them `i` in the front matter, `1.1` under each body chapter and `A-1` in the annex, and a list of each kind; each list shall show every captioned object with its number in its context, and leave out a table without a caption.

Implementation: `labs/src/regression/regression-documents.ts`
Verification: `e2e/regression.spec.ts`, `test/fixtures/documents/regression-set.test.ts`

### DOCE-LABS-4.14 - Object presentation in the reference stylesheet

The reference stylesheet shall align a figure's caption text where the figure is aligned (left, centred or right), the caption spanning the content width, as the layout engine lays its lines out (DOCE-PAGINATION-11.2); label and number linked code as it does code, its text the name of its source, counting each linked code once however the pages split it; draw a table set to `table-border-1px` with one pixel lines in the template's border colour; give a page header's and footer's table cells no padding; and set a template image in a table cell with no paragraph indent.

Implementation: `labs/reference/document.css`
Verification: `e2e/regression.spec.ts`, `e2e/template-content.spec.ts`

## DOCE-LABS-5 - Pretext pagination spike

### DOCE-LABS-5.1 - DOM-free prediction and virtual pages

The Pretext pagination lab shall read stored document fixtures through the editor schema and predict page dimensions and source ranges in a worker, laying text blocks out with the library's text layout engine (DOCE-PAGINATION-9). Its HTML shall draw what the engine computes: the editor's pre-wrap white space, the engine's leadings, and inline code in the code font and size with 3px of padding on each side of each line. It shall reuse prepared inline data on width changes, reuse item-local line offsets at the same width, and discard both when font readiness changes. The read-only viewer shall render only the visible pages and the chosen overscan, support jumping by page number and report unsupported content explicitly. The experiment shall leave production rendering, pagination, and editing unchanged.

Implementation: `labs/src/spikes/pretext-pagination.lab.ts`, `labs/src/spikes/pretext/worker.ts`, `labs/src/spikes/pretext/prediction.ts`, `labs/src/spikes/pretext/settings.ts`, `labs/src/spikes/pretext/html.ts`, `labs/reference/pretext-pagination.css`, `src/layout-engine/text-layout.ts`
Verification: `e2e/pretext-pagination.spec.ts`

### DOCE-LABS-5.2 - Independent HTML parity

The lab shall compare its predictions against natural HTML line layout at multiple widths, including line counts, source start offsets, block box dimensions, page boundaries, and page overflow. The natural HTML's page boundaries shall come from a page fill of the verification's own, from the blocks and lines the browser drew, by the prediction's layout rules written out again and sharing no code with the prediction's packer; the first page whose boundaries differ is reported with whether the prediction ended it before or after the HTML, and a prediction packed into three quarters of each page's room, or a tenth past it, shall be found on the fragments, list and mixed stress documents. It shall verify page and content dimensions, fragmentation, and vertical placement for every rendered page of the text, list and mixed stress documents. It shall check exact source offsets on both sides of a wrap threshold and in naturally rendered split paragraphs, including consecutive hard breaks and mixed inline objects. The 300-page text fixture and every stress document shall also be checked against the production projection, each page's source ranges (`[source, from, to]`, a block without an id by its index) the same at several widths, with the projection laid out by the prediction's rules: a paragraph split at the start of a line its own view drew, and every other block moved whole. A split after a hard break reads as the break's start, since the projection moves the break to the next fragment (DOCE-PAGINATION-3.6); without the prediction's rules the projection splits a paragraph after its last whole word, which ends a page early where a word and its hard breaks span two lines or text has no spaces. Code ending in a line break shows the empty line after it, as the editor draws it. It shall report real discrepancies, unsupported content and stored-content preservation.

Implementation: `labs/src/spikes/pretext/oracle.ts`, `labs/src/spikes/pretext/reference-pages.ts`, `labs/src/spikes/pretext/natural-lines.ts`, `labs/src/spikes/pretext/benchmark.ts`, `labs/src/spikes/pretext/fixtures.ts`
Verification: `e2e/pretext-pagination.spec.ts`, `e2e/pretext-pagination-stress.spec.ts`

### DOCE-LABS-5.3 - Complete measurements

The lab shall provide an opt-in repeated browser benchmark from the same stored inputs through index production and visible HTML for both the experiment and the existing projection path. It shall include the 4,420-block text stress document and a version with distinct paragraph text alongside the repeated-text workloads. The benchmark shall record first visible paint timing, complete index timing, main-thread long tasks, mounted pages and elements, and prepared-data reuse on width changes.

Implementation: `labs/src/spikes/pretext/benchmark.ts`, `labs/src/spikes/pretext-pagination.lab.ts`
Verification: `e2e/pretext-pagination.performance.spec.ts`

### DOCE-LABS-5.4 - Edit and review the stress documents

The Pretext lab shall open every fixture in the full editor, including content the prediction worker cannot paginate. The editor shall support its normal formatting, context menu, comments, suggested edits, decisions and undo. Switching documents or views shall preserve each draft and its comment threads in memory until reload. The Pretext preview and its parity check shall read the selected draft with inline review markup. Opening the preview directly or running measurements shall work without mounting the interactive editor.

Implementation: `labs/pretext-pagination.html`, `labs/src/spikes/pretext/editor.tsx`, `labs/src/spikes/pretext-pagination.lab.ts`
Verification: `e2e/pretext-pagination-editor.spec.ts`, `e2e/pretext-pagination.spec.ts`

### DOCE-LABS-5.5 - Open a virtual page by link

The lab index shall link directly to page 150 of the 4,800-block fixture. The virtual page lab shall use the indexed scroll extent to open the requested page with one page of overscan on either side. A cold load and reload shall mount only the destination window. The lab shall report the visible page, total pages, mounted range and DOM count as the reader scrolls. Following links and using browser history shall reveal the corresponding page. Out-of-range page numbers shall clamp to the document. The scroll geometry shall keep the mounted window bounded with the reference presentation switched off.

Implementation: `labs/pretext-page-link.html`, `labs/reference/pretext-viewport.css`, `labs/src/spikes/pretext-page-link.lab.ts`, `labs/src/spikes/pretext/html.ts`, `labs/src/chrome/mount.tsx`
Verification: `e2e/pretext-page-link.spec.ts`

### DOCE-LABS-5.6 - Closeness to the browser

The lab tests shall measure how close the prediction is to Chromium's own line breaking. Seeded paragraphs of plain text, words that kern with a following space, bold, italic, inline code, links and a dense mix shall be laid out at nine widths by the worker and by natural HTML, and the paragraphs with different line starts or line counts, the pages with different boundaries and the overflowing pages shall equal a recorded budget per kind. A page overflows when its column scrolls or a word or atom of it reaches past the content edge; the ink of white space hanging at a line end does not count. The same run shall happen in Chromium launched at device pixel ratios 1, 1.25 and 2, each checking that the page reports its ratio. A threshold test shall find, in the browser and in the prediction, the narrowest column that keeps a case's last character on its first line: plain controls shall match, and each case of a known fault shall be recorded as an expected miss naming its finding, so a fix fails the test until its miss and budgets are updated.

Implementation: `labs/src/spikes/pretext/thresholds.ts`, `labs/src/spikes/pretext-pagination.lab.ts`, `labs/src/spikes/pretext/oracle.ts`, `playwright.config.ts`
Verification: `e2e/pretext-pagination-fuzz.spec.ts`, `e2e/pretext-pagination.spec.ts`

## DOCE-LABS-6 - Forced-lines spike

### DOCE-LABS-6.1 - Pretext lines in the live editor

Withdrawn. The editor's pages draw every text block on the layout engine's lines (DOCE-PAGINATION-11.2), so the spike and its lab are gone.

Implementation: `src/pagination/forced-lines.ts`
Verification: `e2e/text-layout.spec.ts`

### DOCE-LABS-6.2 - Typing with forced lines

Withdrawn with DOCE-LABS-6.1. Typing on the engine's lines is measured by the editor's own typing budgets (DOCE-LABS-2.3, DOCE-PAGINATION-11.5).

Implementation: `e2e/performance.spec.ts`
Verification: `e2e/performance.spec.ts`

## DOCE-LABS-7 - Font-file widths spike

### DOCE-LABS-7.1 - Widths from the font files

The font-widths lab shall measure a fixed reference text (55 strings at five sizes in each served face: Geist regular, bold, italic and bold italic, Geist Mono, and the KaTeX main and sans faces) from the served font files, shaped with HarfBuzz in WebAssembly, and with the browser's Canvas, and show both fingerprints, the fingerprint of Pretext's line breaks for seeded paragraphs through each, and every string whose widths differ. The font-file widths and line breaks shall equal recorded fingerprints on every machine, in a page and in a worker alike, and the characters no served face has shall be reported. On Linux Chromium the font-file widths shall equal Canvas's, within the last bit of a float32 sum, wherever a served face has the glyphs. The measurer is the library's (DOCE-PAGINATION-11).

Implementation: `labs/font-widths.html`, `labs/src/font-widths.lab.ts`, `src/layout-engine/font-files/`, `test/font-files-reference.ts`, `test/font-files-lines.ts`, `scripts/build-labs.mjs`, `scripts/font-widths.mjs`, `scripts/font-widths-coverage.mjs`
Verification: `e2e/font-widths.spec.ts`

### DOCE-LABS-7.2 - Closeness with font-file widths

The Pretext pagination lab shall serve Geist and Geist Mono to the page and to its worker with `?fonts=served`, mapping the template's families to them through `fontStacks` for both the HTML and the text layout engine, and with `&measurer=font-files` shall measure in the worker with the font files instead of Canvas, reporting which measurer it used, and lay the natural HTML out under `text-rendering: geometricPrecision` with `font-synthesis: none`, as pages under Pretext layout are drawn. The closeness counts of DOCE-LABS-5.6 measured this way shall equal a recorded budget per kind and half of the seeds, each half checked on its own so it runs well inside its time limit.

Implementation: `labs/src/spikes/pretext/fonts.ts`, `labs/src/spikes/pretext/worker.ts`, `labs/src/spikes/pretext/client.ts`, `labs/src/spikes/pretext/settings.ts`
Verification: `e2e/font-widths.spec.ts`

### DOCE-LABS-7.3 - Closeness in other scripts

With `&scripts` the Pretext pagination lab shall also serve the Noto subsets of `test/fixtures/fonts/` (Arabic, Hebrew, Devanagari, Thai, Simplified Chinese with kana, Symbols 2 and Color Emoji, each part with its `unicode-range`) after each of its families, to the page and to the worker. With `&lang=` the lab shall lay its text out in that language, as the page's `lang` and the text layout engine's, English otherwise. The lab shall draw each paragraph in its direction (DOCE-PAGINATION-9.12), so right-to-left paragraphs are compared on a right-to-left base. Seeded paragraphs of emoji (selectors, keycaps, flags, tag sequences, skin tones and joined sequences, with and without spaces), presentation selectors, CJK, small kana, iteration marks and dashes in Chinese and in Japanese (whose breaks depend on the language), Arabic, Hebrew, mixed directions, Devanagari, Thai, combining marks and symbols, measured with the font files, shall differ from Chromium's lines by a recorded budget per kind: none for emoji, selectors, kana and dashes, Devanagari, Thai, combining marks and symbols, and only the known limits of DOCE-PAGINATION-12 for the others.

Implementation: `labs/src/spikes/pretext/fonts.ts`, `labs/src/spikes/pretext/settings.ts`, `labs/src/spikes/pretext/prediction.ts`, `labs/src/spikes/pretext-pagination.lab.ts`, `scripts/build-labs.mjs`, `test/fixtures/fonts/`
Verification: `e2e/font-widths.spec.ts`

### DOCE-LABS-7.4 - Reserved boxes drawn as measured

The font-widths lab shall lay out texts of characters no served face has (Ethiopic, Cherokee, Tifinagh, Han, kana, Hangul, Thai, Devanagari, Arabic, Hebrew, emoji, symbols and letters with marks no face has together) among Latin words in Geist, with the font files, and draw each computed line on its own with each reserved cluster in a `de-forced-lines__reserved` of its reserved width, under the reference stylesheet. Every line shall be drawn as wide as the measurer counted it, within 1/64 px for each piece of text between boxes, whatever font the system draws the reserved clusters with (DOCE-PAGINATION-12.4).

Implementation: `labs/src/font-widths.lab.ts`, `labs/reference/document.css`
Verification: `e2e/font-widths.spec.ts`

### DOCE-LABS-7.5 - Equations laid out the same everywhere

The font-widths lab shall lay out the equations of `test/math-layouts.ts` (the regression set's math, tall equations and a sweep of what KaTeX typesets, each inline and displayed, as the MathML KaTeX gives the editor) with the MathJax layouter (DOCE-PAGINATION-12.12) and show the fingerprint of their boxes and drawings at 16 px. It shall equal the fingerprint Node gives on every machine; the weekly workflow runs it on macOS and Windows with DOCE-LABS-7.1.

Implementation: `labs/src/font-widths.lab.ts`, `test/math-layouts.ts`, `scripts/build-labs.mjs`
Verification: `e2e/font-widths.spec.ts`

## DOCE-LABS-8 - One layout result

### DOCE-LABS-8.1 - Computed lines and pages are the drawn ones

The regression lab shall show (`window.regressionLab.textLines()`) the layout engine's result: page by page, each text block fragment it laid out with the lines it draws on that page, and each block it left to the DOM with the reason. For every document of the regression set, at zooms of 50, 67, 75, 90, 100, 110, 125, 133, 150, 175 and 200 percent at a device pixel ratio of 1, of 50, 100 and 150 percent in Chromium launched at device pixel ratios 1.25 and 2, and of 100 percent at ratios 1.5, 1.75 and 3 (display scaling at 150, 175 and 300 percent), the editor shall draw as many pages as computed, each page shall draw exactly the forced blocks the engine put on it, nested ones and those in its header, footer and footnotes included once the engine forces them, and each block's drawn lines, read from the line boxes its own characters sit on, shall equal the computed lines in count and text: a hard break's box counts, so an empty line between two breaks is a line, and a block locked as a whole, such as a template's, is read like any other. The guard (`wrappedLines()`, DOCE-PAGINATION-11.4) shall find no wrapped block there either, and each number of a code block's gutter shall sit on the first row of its line of code, the gutter ending where the code does, linked code's included; linked code whose long lines, highlighted and one with an unserved emoji, the engine wraps shall hold all of this at 50, 100 and 175 percent. A block drawn in a narrower column than its lines were fitted to shall fail the check. The regression lab shall take a `zoom` query in percent.

Implementation: `labs/src/regression/regression-lab.tsx`, `labs/src/regression/regression-probe.ts`, `playwright.config.ts`
Verification: `e2e/layout-invariant.spec.ts`

### DOCE-LABS-8.2 - The invariant through editing

Typing and deleting at a paragraph split between pages, a hard break and a new paragraph shall keep DOCE-LABS-8.1: after the edit settles, the drawn lines and pages shall equal those computed again.

Implementation: `labs/src/regression/regression-probe.ts`
Verification: `e2e/layout-invariant.spec.ts`

### DOCE-LABS-8.3 - The caret at forced line starts

After an edit at a forced line's start, the caret shall be drawn at the start of that line, not at the end of the line above, and Arrow Down and Arrow Up shall move one drawn line each and keep the caret's column. A caret the browser drew at a line's end, after End, shall stay there.

Implementation: `src/pagination/forced-lines.ts`
Verification: `e2e/layout-invariant.spec.ts`

### DOCE-LABS-8.4 - Inline offers keep the drawn lines

With an inline completion offer showing inside a full forced line, the block shall draw exactly its computed lines: the browser shall wrap no line around the offer.

Implementation: `src/pagination/forced-lines.ts`
Verification: `e2e/layout-invariant.spec.ts`

### DOCE-LABS-8.5 - Formatting-only edits

Making a word bold, undoing and redoing it shall each leave the drawn lines equal to the computed ones, and the lines computed after the undo and after the redo shall equal those computed before the bold and after it.

Implementation: `src/pagination/forced-lines.ts`
Verification: `e2e/layout-invariant.spec.ts`

### DOCE-LABS-8.6 - Grapheme clusters at forced line edges

Repeated emoji, a joined emoji sequence and letters with combining marks, typed with no space so lines end and start inside them, shall be drawn on the computed lines; no line decoration shall start or end inside a grapheme cluster or hold half a surrogate pair, and Shift+Arrow Right at each line start shall select one whole cluster. A cluster has no length limit: in a centered title starting with a letter and 40 accents, and lines of families of four people with skin tones, each line's indent and end hold whole clusters, the title's first indent the whole letter with its accents.

Implementation: `src/layout-engine/line-marks.ts`, `src/layout-engine/graphemes.ts`, `src/pagination/forced-lines.ts`
Verification: `src/layout-engine/line-marks.test.ts`, `e2e/layout-invariant.spec.ts`

### DOCE-LABS-8.7 - Review and editing on a stress document

On the scale lab's 300 pages with 500 comment threads and the text layout engine on, starting a comment on a forced line, typing and deleting suggested text, opening and closing the context menu and keyboard editing (a new paragraph, a hard break, deleting a word and undoing) shall leave every forced block on the pages in view drawing its computed number of lines. The stress labs shall type as suggestions with a `suggest` query.

Implementation: `labs/src/stress/stress-lab.tsx`
Verification: `e2e/layout-invariant.spec.ts`

### DOCE-LABS-8.8 - The same result on every device

For five documents of the regression set, a fingerprint of the computed result (the pages, each text block's type and part, and its line offsets or why the browser draws it) shall equal the recorded one at zooms of 50, 100 and 150 percent in Chromium at device pixel ratios 1, 1.25 and 2. A second fingerprint, of the planned heights (each page's used and free room, and each top-level block's type, part, planned top and height to a thousandth of a pixel, from the regression lab's `debug` query), shall equal the recorded one in the same runs. It also runs at ratios 1.5, 1.75 and 3. Pull requests run both fingerprints on Linux; a weekly workflow runs them, with DOCE-LABS-7.1, in Chromium on macOS and Windows and opens or updates one issue when they fail. The sizes measured in the page, of the blocks the engine does not lay out (tables, figures, code, display math, contents) and of each page's room beside its header and footer, are measured the same on every screen (DOCE-PAGINATION-10.10), so the heights hold at every ratio with no expected failure.

Implementation: `src/pagination/text-engine.ts`
Verification: `e2e/layout-invariant.spec.ts`

### DOCE-LABS-8.9 - The same result painted into a canvas

With `rendering=html-canvas` (DOCE-EDITOR-1.9), DOCE-LABS-8.1 shall hold for every document of the regression set at the same zooms and device pixel ratios, with every page painted into a canvas: the lines and pages drawn are the computed ones under both renderers. The regression lab shall take a `rendering` query.

Implementation: `labs/src/regression/regression-lab.tsx`, `playwright.config.ts`
Verification: `e2e/layout-invariant.spec.ts`

### DOCE-LABS-8.10 - Planned block geometry is the drawn one

For every document of the regression set, laid out with the layout engine, at 100 percent and a device pixel ratio of 1, with every page on the engine's lines, each top-level block of each page shall be drawn as tall as the layout planned it (`data-debug-height`) and as far below the block before it as planned (from `data-debug-top`), within half a pixel and one layout unit for every 20 pixels of its height, and no page holding more than one block shall draw its content more than a pixel past its room (`data-debug-used` plus `data-debug-free`). The check names every difference it finds today, by document and place, one block's fragment and kind (its type, its count among the document's top-level blocks of that type and its split part) or one page's overflow, with the thread that owns its fix; a difference it does not name fails, a second block or fragment with the same fault included, and so does a named one that no longer happens, so the fix removes its entry. A block with no height, planned or drawn, has no top of its own to check; the gap of the next block is read from the block before it. A difference that depends on timing is allowed but not required, and named as a fault: a figure's height only where its image did not load, and an equation by its place. A block drawn taller or lower than planned, and a page drawn past its room, shall fail the check. The overflow check of DOCE-PAGINATION-11.4's browser test reads the same room, not the page content's own box, which grows with its content.

Implementation: `labs/src/regression/regression-lab.tsx`
Verification: `e2e/block-geometry.spec.ts`, `e2e/text-layout.spec.ts`

### DOCE-LABS-8.11 - Blocks left to the DOM, counted

Every document of the regression set, laid out block by block by the pages' text layout engine as the pages lay it out, shall leave to the DOM's measuring exactly the pinned number of blocks for each document, and for each reason over the whole set. A change that leaves more fails, and so does one that leaves fewer: the pull request that lays out more blocks with the engine writes the lower counts, so they only go down.

Implementation: `src/pagination/text-engine.ts`
Verification: `src/pagination/text-engine-refusals.test.ts`

### DOCE-LABS-8.12 - Pages coming near the screen

With only the pages near the screen drawn on the engine's lines (DOCE-PAGINATION-11.6), on the regression set's long document, scrolling the editor's frame down to the end and back up half a screen at a time, then jumping to a far page, shall after each move draw every page within half a screen of the frame with exactly the forced blocks the engine put on it, each on its computed lines, while a page farther away keeps the browser's lines; every page and every top-level block shall keep the place and height it had before its page was forced, and the frame shall stay at the scroll position it was moved to.

Implementation: `src/pagination/projection.ts`
Verification: `e2e/near-pages.spec.ts`

## DOCE-LABS-9 - Edited pages equal a fresh layout

### DOCE-LABS-9.1 - Seeded edit sequences in the regression lab

After every step of a seeded sequence of edits on a document of the regression set (typing; Enter and Shift+Enter; Backspace and Delete runs; deletes across blocks, pages and sections; typing, Enter, Backspace and Delete at the edges of split blocks and at line starts and ends; bold, italic, code, superscript and heading and paragraph styles over a range; undo and redo; pasted text and HTML; an input method's composition committed or cancelled; another writer's inserts and deletes; zoom changes), the editor shall draw what a new page draws when it opens the document as stored (`stored()`) afresh: the same pages' layout (`pagesLayout()`: pages, page breaks, split parts, every forced block's lines, numbers and variables), the same text on every page, and its own drawn lines equal to its computed ones (DOCE-LABS-8.1). A failure names the steps so far. The regression lab's probe shall open a stored document afresh (`load`), set the zoom (`setZoom`), give the text blocks' ranges (`textRanges`), select between two positions (`selectJoined`), make another writer's change (`remote`) and give the pages' layout (`layout`). `EDIT_LAYOUT_SEEDS`, `EDIT_LAYOUT_STEPS` and `EDIT_LAYOUT_FIRST_SEED` set how many sequences, how long, and from which seed.

Implementation: `labs/src/regression/regression-lab.tsx`, `labs/src/regression/regression-probe.ts`
Verification: `e2e/editing-layout.spec.ts`

### DOCE-LABS-9.2 - Seeded edit sequences in a shared room

The shared room lab (DOCE-COLLAB-6.4) shall hold DOCE-LABS-9.1 for two writers editing one document through the room server, each at their own width and zoom, on its short and its long document. Each step is a single-writer step made by one of the writers, another writer's change typed in the other writer's editor, or a step of the room's: a writer going offline and coming back to merge what each changed meanwhile, both writers typing at once, or a service writing the room (`updateRoomDocument`, DOCE-COLLAB-6.5). After each step, once both writers online hold the same stored document, their pages' layouts shall be the same, and each writer's pages shall equal a fresh layout of the document they hold, opened in a third editor, with their own drawn lines equal to their computed ones. The lab shall lay its writers' pages out with the engine, and its probe shall give a writer's stored document, pages' layout, computed lines and text block ranges, select in a writer's document, draw every page on the engine's lines, wait for every editor to settle, write the room as a service, and open a stored document in the third editor.

Implementation: `labs/src/collab-room.lab.tsx`
Verification: `e2e/editing-layout-room.spec.ts`

## DOCE-LABS-10 - Browser tests in CI

### DOCE-LABS-10.1 - Shards of equal time

Hosted CI shall run the lab tests, the one-result invariant's page checks at a device pixel ratio of 1 and the invariant at the display scaling ratios in shards that end at about the same time, each test in exactly one shard. `scripts/lab-shards.mjs plan` shall deal the listed tests out by the seconds recorded in `scripts/lab-durations.json`, slowest first, each to the shard with the least time so far, and write one shard's tests as a Playwright `--test-list` file, failing when the file does not select exactly the tests planned for it. A test with no recorded time counts as the median recorded test, and a test as at least 0.2 s, so a stale record only costs balance. `scripts/lab-shards.mjs record` shall rewrite the record from the list reporter's lines in the CI logs of every shard of one run, and with `--average` record each test as the mean of its recorded time and the new one, keeping only the tests of the new run.

Implementation: `scripts/lab-shards.mjs`, `scripts/lib/lab-shards.mjs`, `scripts/lab-durations.json`, `.github/workflows/ci.yml`
Verification: `test/lab-shards.test.ts`
