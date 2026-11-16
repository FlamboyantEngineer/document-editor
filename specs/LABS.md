# Labs

Labs are static demo pages that show each area of the editor with neutral sample documents. They are debugging and review pages, not package API. Each lab is a static file `labs/<name>.html` that loads the bundle `npm run build:labs` builds into `labs/build/<name>.js`, and `npm run serve:labs` serves them at `127.0.0.1`, port 4183 or the `LABS_PORT` environment variable.

## DOCE-LABS-1 - Pages

### DOCE-LABS-1.1 - Local start

`npm run labs` shall bring a checkout's labs up to date before serving them with the supplied server, passing its server options through: it runs `npm ci` when the dependencies are missing or `package-lock.json` changed since the last install, and `npm run build:labs` after an install, when the labs are not built, or when a lab source (the library and lab sources, the lab stylesheets `labs/reference.css` and `labs/reference/`, the installed dependencies, the package and TypeScript configuration and the labs build scripts) changed, was added or was removed since the last build. It leaves a `node_modules` linked from another checkout alone. `--dry-run` prints the steps it would run, or that the labs are up to date, without running them or serving.

Implementation: `scripts/start-labs.mjs`, `package.json`
Verification: `test/start-labs.test.ts`

### DOCE-LABS-1.2 - Lab toolbar

Every lab page and the lab index shall start with the lab bar of `@flamboyantengineer/ui-components/labs` (UIC-LABS-4), which stays at the top of the page as it scrolls, named Lab settings: on a lab page an All labs link back to the index and the lab's title (the page title without ` · Labs`), on the index the title Labs, then the bar's Stylesheet picker and Theme switch. Each page loads the bar from `labs/build/chrome.js` beside its own bundle, mounted with `mountLabBar` in a shadow root, so neither the chosen stylesheet nor the lab restyles it. Each lab still marks itself ready (`data-lab-ready` on the root) once it has rendered; the chrome marks only the index ready.

Implementation: `labs/src/chrome/mount.tsx`, `scripts/build-labs.mjs`, `labs/index.html`
Verification: `e2e/labs.spec.ts`

### DOCE-LABS-1.3 - Stylesheet

The Stylesheet picker (UIC-LABS-2.1) shall load, for Reference, the default, `labs/build/reference.css`, bundled from `labs/reference.css`: the base library's reference stylesheet, the document reference stylesheet `labs/reference/document.css` and the lab pages' layout. A classic script in each page's head (`labs/build/boot.js`) applies the choice with `bootLabSettings` before the body is parsed (UIC-LABS-2.5).

Implementation: `labs/src/chrome/boot.ts`, `labs/reference.css`, `scripts/build-labs.mjs`
Verification: `e2e/labs.spec.ts`

### DOCE-LABS-1.4 - Theme

The Theme switch (UIC-LABS-2.2) shall write the theme to the root attribute the reader names. With the Reference stylesheet, everything around the pages (the page background, text, side panels, lists and comment cards) follows the theme's reference tokens, while the pages stay paper: dark text on white.

Implementation: `labs/reference.css`, `labs/reference/document.css`
Verification: `e2e/labs.spec.ts`

### DOCE-LABS-1.5 - Remembered settings

The settings shall be read and remembered as UIC-LABS-2.3 says, in the browser's local storage (`labs/src/chrome/storage.ts`), a page whose storage is refused using the defaults. The index carries the settings into its links to each lab, and a lab's All labs link carries them back.

Implementation: `labs/src/chrome/storage.ts`, `labs/src/chrome/mount.tsx`
Verification: `e2e/labs.spec.ts`

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

`npm run test:perf` shall measure the performance budgets on the scale lab (`e2e/performance.spec.ts`, run apart from `npm run test:labs` as the `budgets` project), with the browser's own counters (`Performance.getMetrics`, a trace's restyled elements) and the pagination's (`layoutStats`), and report each metric beside its target and whether it meets it, as a table and in `test-results/performance.json`. The typing budgets on 40 and 300 pages, the remote typing budget and the remote typing budget while changes show (`?compare` on the scale lab) are enforced: each is measured on every key's own work (`keystrokeWork`), from the key's press until its input is handled and from the start of the frame that draws it until that frame is drawn, without the wait for that frame, and a test fails on a missed one; remote typing is measured from a remote writer's keystroke reaching the editor, one every 100 ms into the middle of the document, to the frame after it is drawn, since remote changes repaint at once with no fixed tick. The other budgets are targets until the pagination phase ends: the harness records and does not fail on a missed one. Time budgets are measured on the development machine; counter budgets do not depend on it.

| Budget                         | Metric                                                                                                                                                                                           | Target                                   |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| Single section, 5000 blocks    | Pages; first settled time                                                                                                                                                                        | ≥ 300 pages; the time is recorded        |
| Multi-section, 25 × 200 blocks | After an edit mid-document: layouts until settled; template regions drawn again; sections reused per layout (`sectionsReused`)                                                                   | ≤ 4; ≤ 24; ≥ 23 of 25                    |
| Remote keystroke, 1600 blocks  | Per keystroke: sections relaid (`sectionsRelaid`); blocks measured (`blocksMeasured`)                                                                                                            | ≤ 1; ≤ 5                                 |
| Wheel scroll                   | Browser layouts per wheel event, on 5 and 40 pages                                                                                                                                               | ≤ 3, no growth with the pages            |
| Typing style scope             | Elements restyled per keystroke, 40 pages against 5                                                                                                                                              | ≤ 3 times                                |
| Keystroke latency              | p95 of each key's own work, on 40 and 300 pages (enforced)                                                                                                                                       | ≤ 16 ms; ≤ 32 ms                         |
| Remote typing                  | p95 from a remote keystroke reaching the editor to the frame after it is drawn, on 300 pages (enforced)                                                                                          | ≤ 32 ms                                  |
| Typing while changes show      | With the document compared with itself as opened, shown as change bars, on 300 pages: p95 of each key's own work (recorded); p95 of a remote keystroke to the frame after it is drawn (enforced) | ≤ 32 ms; ≤ 32 ms                         |
| Typing beside comment threads  | p95 from a key's press to the frame after it is drawn, on 300 pages beside 500 open comment threads                                                                                              | ≤ 32 ms                                  |
| Load, 24 pages                 | `whenSettled` time from navigation over five loads: median, p95                                                                                                                                  | ≤ 6 s; ≤ 12 s                            |
| Workload load, 18 and 40 pages | `whenSettled` time from navigation, median of five loads with the cache cleared (cold) and of five reloads                                                                                       | ≤ 2.6 s and ≤ 2.2 s; ≤ 4.5 s and ≤ 4.0 s |

A text-only change shall walk no section it does not change, through every editing plugin: a plugin that follows changes reads only the nodes they reached (`changedNodes`), and paragraph numbering keeps its numbers, moved with the change, when typing leaves every paragraph with or without its numbering content. A unit test fails on any walk of an untouched section's children, descendants or a range of them.

Implementation: `e2e/budgets.ts`, `e2e/performance.spec.ts`, `labs/src/stress/stress-probe.ts`, `playwright.config.ts`, `package.json`, `src/utils/changed-ranges.ts`, `src/engine/paragraph-numbering.ts`, `src/engine/scripts.ts`, `src/engine/table-width.ts`
Verification: `e2e/performance.spec.ts`, `src/engine/text-change-locality.test.ts`, `src/engine/paragraph-numbering.test.ts`

### DOCE-LABS-2.4 - Scale lab

The `stress-scale` lab shall show the documents the budgets name, picked by its size picker or the page's `size` query parameter: about 5, 24, 40 and 300 pages in one section, one section of 5000 blocks, 25 sections of 200 blocks, 1600 blocks in eight sections, and about 300 pages beside 500 open comment threads, each the same on every load; and offer a remote writer typing into the middle of the document (Remote typist). Each stress lab shows the harness its editor's layout state and counters, when its pages first settled, and a way to type as a remote writer, a character at a time or up to the end of a line (`window.stressLab`).

Implementation: `labs/src/stress-scale.lab.tsx`, `labs/stress-scale.html`, `labs/src/stress/scale-documents.ts`, `labs/src/stress/stress-probe.ts`, `labs/src/stress/stress-lab.tsx`
Verification: `e2e/stress.spec.ts`, `e2e/performance.spec.ts`

### DOCE-LABS-2.5 - Counter budgets

The budgets counted in layouts, sections, blocks and restyled elements rather than time do not depend on the machine, and `npm run test:labs` shall hold them on every pull request, measured as the harness measures them (`e2e/budgets.ts`): after an edit in the middle of 25 sections, at most four layouts and 24 template regions drawn again, and at least 23 sections reused per layout; a remote keystroke that starts a new line in 1600 blocks relays at most one section and measures at most five blocks, and one inside a line lays nothing out; at most three browser layouts per wheel event on 5 pages and on 40; and a keystroke on 40 pages restyles at most three times as many elements as on 5. A budget not met yet is an expected failure naming its gap in the port plan.

Implementation: `e2e/budgets.ts`
Verification: `e2e/budget-counters.performance.spec.ts`

## DOCE-LABS-3 - Editor labs

### DOCE-LABS-3.1 - The template editor beside a document

The template editor lab shall show the template editor beside the document editor, a template inheriting from the base template, each change restyling the document at once. Host options mark the template as never saved, fail its parent's load, disable the editor and lock the parent in the JSON text; the lab offers its own fonts and reports section renames and whether the JSON text reads as a template.

Implementation: `labs/src/template-editor.lab.tsx`, `labs/template-editor.html`
Verification: `e2e/template-editor.spec.ts`

### DOCE-LABS-3.2 - The full editor

The full editor lab shall show the document editor with every feature on, as a host assembles it: the comments margin over the in-memory host's comment store, suggest mode and how suggestions show, proofing with two proofers, find and replace, zoom, the toolbar, status bar and scrolling frame, the host's own toolbar items, context menu entries and locked paragraph, collaborators' carets, an agent working through the automation API, figures and linked code through the in-memory host's assets and code source, references and abbreviations through its citations and glossary, and the outline and search panels.

Implementation: `labs/src/full-editor.lab.tsx`, `labs/full-editor.html`
Verification: `e2e/full-editor.spec.ts`

### DOCE-LABS-3.3 - Host services mimicked in the page

The host services lab shall mimic in the page each host service that needs a backend, so a person can try it by hand: embedded content the host keeps (`EmbedSourceAdapter`), which the controls change, remove or deny at the host and the writer checks and takes in again; the host's variables in the page headers (`VariablesAdapter`), changed while the document is open; font loading (`FontsAdapter`) that is immediate, slow or failing; and logs of what the editor measured (`TelemetryAdapter`) and told the reader (`FeedbackAdapter`). The editor shows the host's zoom levels, symbols and code languages, and can be hidden (`active`).

Implementation: `labs/src/host-services.lab.tsx`, `labs/host-services.html`
Verification: `e2e/host-services.spec.ts`

### DOCE-LABS-3.4 - Import and export

The import and export lab shall read a word processing document, Markdown, HTML (pasted or from a file) or a stored document into the section of a template it picks, listing the reader's warnings and refusing an archive past the limits it sets, and write the open document, whole or one section, as Markdown (with its title, front matter, comments and suggestions), HTML, a word processing document or the stored format, with its suggestions accepted or rejected.

Implementation: `labs/src/import-export.lab.tsx`, `labs/import-export.html`
Verification: `e2e/import-export.spec.ts`

### DOCE-LABS-3.5 - Automation on stored documents

The automation lab shall mimic a host's server over the in-memory store: an agent, person or system reads the stored document and sends a batch of edits against the revision it read, directly or as suggestions, and the host saves the result and keeps the threads the batch opened. Another writer saving first makes the batch a conflict, and a locked section or text that moved refuses it. The host runs the document's scripts, accepts or rejects every suggestion, lists what changed since the save before and shows the JSON Schemas it offers an agent. The stored-file readers run on the stored document without an editor: the element with an id, the text, the citations, the reference targets, the required sections a stricter template lacks and the thread anchors; the host moves the document to that template and accepts one suggestion on the stored file.

Implementation: `labs/src/automation.lab.tsx`, `labs/automation.html`
Verification: `e2e/automation-lab.spec.ts`

### DOCE-LABS-3.6 - Side panels

The side panels lab shall show the panel at the document's start controlled by the host (its selected pane, whether it shows and its width between a narrowest and widest, each change reported) or left to itself, remembering its pane, expanded state and width across reloads under a key through the page's storage; and the outline, search, properties and contributors panes on their own beside the document, the outline leaving out the title or collapsing the headings below a level.

Implementation: `labs/src/panels.lab.tsx`, `labs/panels.html`
Verification: `e2e/panels.spec.ts`

### DOCE-LABS-3.7 - Template content in place

The template content lab shall show a template's preview in parts beside the template as JSON: a read-only sample, then each template section's content and placeholder, edited in place with the toolbar and its variable menu, and the headers and footers, each edit written into the template.

Implementation: `labs/src/template-content.lab.tsx`, `labs/template-content.html`
Verification: `e2e/template-content.spec.ts`

## DOCE-LABS-4 - Regression labs

The pagination regression scenarios lay out the regression set's documents (`test/fixtures/documents/`) and check the pages a reader sees and the document the writer would store. A scenario the editor does not pass yet is an expected failure that names its gap in the port plan; it passes once that work lands, and its mark comes off then. The scenarios run with `npm run test:labs`, and on every pull request.

### DOCE-LABS-4.1 - The regression lab

The `regression` lab shall show a document of the regression set on its template's pages, the template resolved through the set's templates on the base template, in the document editor with its scrolling frame and status bar, picked by its Document picker or the page's `document` query parameter, and in the web layout when the `layout` query parameter is `web`, on a projection of the document (DOCE-PAGINATION-7.17), with quotes drawn by a host's React view, taller than the schema draws them, when it has a `hostViews` one. It shows the scenarios the document as it would be stored, puts a caret at a split block's fragment boundary, by the position the caret has once the pages are joined whole, and gives the pages as a snapshot for printing (`snapshot`, DOCE-EDITOR-6.19) (`window.regressionLab`). Every document lays out on pages that hold their content, as many as the status bar counts.

Implementation: `labs/src/regression.lab.tsx`, `labs/regression.html`, `labs/src/regression/regression-lab.tsx`, `labs/src/regression/host-quote-view.tsx`, `labs/src/regression/regression-documents.ts`, `labs/src/regression/regression-probe.ts`
Verification: `e2e/regression.spec.ts`, `e2e/print.spec.ts`

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

A 150-line listing shall split at line breaks, each line on one page only, each fragment numbering its lines on from the last; a quoted code block longer than a page splits inside its quote. The regression set's `code-block-stress` document shall hold linked code of one page, of a whole file, of a range starting at a three-digit line and of a range placed after prose so it splits mid-page, and short, long and long-row authored blocks; each long block splits with its fragments numbering on from its first line.

Implementation: `labs/src/regression/regression-documents.ts`
Verification: `e2e/regression.spec.ts`

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
Verification: `e2e/regression.spec.ts`

### DOCE-LABS-4.12 - Roman numbering

The regression set's `roman-numbering-coverage` document shall number lower-case Roman front matter (`i.`, `i.i`), an upper-case Roman body on three levels (`I.`, `I.1`, `I.1.i`) and an annex that starts again (`I-`); its ordered lists, nested ones among them, shall number in their section's Roman style, each on from its start, at the subtractive edges (3, 8, 38, 48, 98, 398, 498, 898, 998, 3,998), past 3,999 (3,999, 7,998, 12,000) and over pages in a 240-item list; and its figures, tables, code blocks and equations, listed in the front matter, shall number from 1 under each chapter (`I-1`, `II-1`) and again in the annex (`I.i`).

Implementation: `labs/src/regression/regression-documents.ts`
Verification: `e2e/regression.spec.ts`, `test/fixtures/documents/regression-set.test.ts`

### DOCE-LABS-4.13 - Caption numbering

The regression set's `caption-numbering` document shall hold captioned figures, tables, code blocks and equations in three numbering contexts, its own template (`regression-captions`) numbering them `i` in the front matter, `1.1` under each body chapter and `A-1` in the annex, and a list of each kind; each list shall show every captioned object with its number in its context, and leave out a table without a caption.

Implementation: `labs/src/regression/regression-documents.ts`
Verification: `e2e/regression.spec.ts`, `test/fixtures/documents/regression-set.test.ts`
