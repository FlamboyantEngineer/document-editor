# Labs

Labs are static demo pages that show each area of the editor with neutral sample documents. They are debugging and review pages, not package API. Each lab is a static file `labs/<name>.html` that loads the bundle `npm run build:labs` builds into `labs/build/<name>.js`, and `npm run serve:labs` serves them at `127.0.0.1`, port 4183 or the `LABS_PORT` environment variable.

## DOCE-LABS-1 - Pages

### DOCE-LABS-1.1 - Local start

`npm run labs` shall bring a checkout's labs up to date before serving them with the supplied server, passing its server options through: it runs `npm ci` when the dependencies are missing or `package-lock.json` changed since the last install, and `npm run build:labs` after an install, when the labs are not built, or when a lab source (the library and lab sources, the lab stylesheets `labs/reference.css` and `labs/reference/`, the installed dependencies, the package and TypeScript configuration and the labs build scripts) changed, was added or was removed since the last build. It leaves a `node_modules` linked from another checkout alone. `--dry-run` prints the steps it would run, or that the labs are up to date, without running them or serving.

Implementation: `scripts/start-labs.mjs`, `package.json`
Verification: `test/start-labs.test.ts`

### DOCE-LABS-1.2 - Lab toolbar

Every lab page and the lab index shall start with a toolbar that stays at the top of the page as it scrolls, named Lab settings: on a lab page an All labs link back to the index and the lab's title (the page title without ` · Labs`), on the index the title Labs, then a Stylesheet picker and a Theme picker. Each page loads the toolbar from `labs/build/chrome.js` beside its own bundle and holds it in a shadow root, so neither the chosen stylesheet nor the lab restyles it. Each lab still marks itself ready (`data-lab-ready` on the root) once it has rendered; the toolbar marks only the index ready.

Implementation: `labs/src/chrome/lab-chrome.tsx`, `labs/src/chrome/mount.tsx`, `scripts/build-labs.mjs`, `labs/index.html`
Verification: `e2e/labs.spec.ts`

### DOCE-LABS-1.3 - Stylesheet

The Stylesheet picker shall offer Reference, the default, which loads `labs/build/reference.css`, bundled from `labs/reference.css`: the base library's reference stylesheet, the document reference stylesheet `labs/reference/document.css` and the lab pages' layout; Unstyled, which loads no stylesheet; and Custom URL, which loads the stylesheet at the URL typed in. A classic script in each page's head (`labs/build/boot.js`) applies the choice before the body is parsed, and the stylesheet holds the first paint until it loads. The root's `data-lab-stylesheet-state` reports `none`, `loading`, `loaded` or `error`, a stylesheet replaced before it loads does not report, and the lab's content stays hidden while the stylesheet loads.

Implementation: `labs/src/chrome/settings.ts`, `labs/src/chrome/boot.ts`, `labs/reference.css`, `scripts/build-labs.mjs`
Verification: `labs/src/chrome/settings.test.ts`, `e2e/labs.spec.ts`

### DOCE-LABS-1.4 - Theme

The Theme picker shall offer System, the default, which writes `light` or `dark` from the reader's colour scheme and follows its changes; Light; Dark; and Custom, which writes the value typed in, or nothing when it is empty. The theme is written to a root data attribute the reader names, `data-theme` by default; a name that is not a `data-` attribute, or is a `data-lab-` attribute, falls back to `data-theme`, and the attribute written before is removed. With the Reference stylesheet, everything around the pages (the page background, text, side panels, lists and comment cards) follows the theme's reference tokens, while the pages stay paper: dark text on white.

Implementation: `labs/src/chrome/settings.ts`, `labs/src/chrome/lab-chrome.tsx`, `labs/reference.css`, `labs/reference/document.css`
Verification: `labs/src/chrome/settings.test.ts`, `e2e/labs.spec.ts`

### DOCE-LABS-1.5 - Remembered settings

The stylesheet, theme and theme attribute shall be read from the page's query string (`stylesheet`, `theme`, `themeAttribute`), then from the choices remembered in the browser's local storage, then from the defaults, and a page whose storage is refused uses the defaults. A choice made in the toolbar is remembered and written into the page's query string, which leaves settings at their default out and keeps other parameters. The index carries the settings into its links to each lab, and a lab's All labs link carries them back.

Implementation: `labs/src/chrome/settings.ts`, `labs/src/chrome/mount.tsx`
Verification: `labs/src/chrome/settings.test.ts`, `e2e/labs.spec.ts`

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

`npm run test:perf` shall measure the performance budgets on the scale lab (`e2e/performance.spec.ts`, run apart from `npm run test:labs` as the `budgets` project), with the browser's own counters (`Performance.getMetrics`, a trace's restyled elements) and the pagination's (`layoutStats`), and report each metric beside its target and whether it meets it, as a table and in `test-results/performance.json`. The typing budgets on 40 and 300 pages are enforced: each is measured on every key's own work (`keystrokeWork`), from the key's press until its input is handled and from the start of the frame that draws it until that frame is drawn, without the wait for that frame, and a test fails on a missed one. The other budgets are targets until the pagination phase ends: the harness records and does not fail on a missed one. Time budgets are measured on the development machine; counter budgets do not depend on it.

| Budget                         | Metric                                                                                                                         | Target                            |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------- |
| Single section, 5000 blocks    | Pages; first settled time                                                                                                      | ≥ 300 pages; the time is recorded |
| Multi-section, 25 × 200 blocks | After an edit mid-document: layouts until settled; template regions drawn again; sections reused per layout (`sectionsReused`) | ≤ 4; ≤ 24; ≥ 23 of 25             |
| Remote keystroke, 1600 blocks  | Per keystroke: sections relaid (`sectionsRelaid`); blocks measured (`blocksMeasured`)                                          | ≤ 1; ≤ 5                          |
| Wheel scroll                   | Browser layouts per wheel event, on 5 and 40 pages                                                                             | ≤ 3, no growth with the pages     |
| Typing style scope             | Elements restyled per keystroke, 40 pages against 5                                                                            | ≤ 3 times                         |
| Keystroke latency              | p95 of each key's own work, on 40 and 300 pages (enforced)                                                                     | ≤ 16 ms; ≤ 32 ms                  |
| Typing beside comment threads  | p95 from a key's press to the frame after it is drawn, on 300 pages beside 500 open comment threads                            | ≤ 32 ms                           |
| Load, 24 pages                 | `whenSettled` time from navigation over five loads: median, p95                                                                | ≤ 6 s; ≤ 12 s                     |

One budget waits for its phase: a text-only change walking no untouched section, which a unit test will check.

Implementation: `e2e/budgets.ts`, `e2e/performance.spec.ts`, `labs/src/stress/stress-probe.ts`, `playwright.config.ts`, `package.json`
Verification: `e2e/performance.spec.ts`

### DOCE-LABS-2.4 - Scale lab

The `stress-scale` lab shall show the documents the budgets name, picked by its size picker or the page's `size` query parameter: about 5, 24, 40 and 300 pages in one section, one section of 5000 blocks, 25 sections of 200 blocks, 1600 blocks in eight sections, and about 300 pages beside 500 open comment threads, each the same on every load; and offer a remote writer typing into the middle of the document (Remote typist). Each stress lab shows the harness its editor's layout state and counters, when its pages first settled, and a way to type as a remote writer (`window.stressLab`).

Implementation: `labs/src/stress-scale.lab.tsx`, `labs/stress-scale.html`, `labs/src/stress/scale-documents.ts`, `labs/src/stress/stress-probe.ts`, `labs/src/stress/stress-lab.tsx`
Verification: `e2e/stress.spec.ts`, `e2e/performance.spec.ts`

### DOCE-LABS-2.5 - Counter budgets

The budgets counted in layouts, sections, blocks and restyled elements rather than time do not depend on the machine, and `npm run test:labs` shall hold them on every pull request, measured as the harness measures them (`e2e/budgets.ts`): after an edit in the middle of 25 sections, at most four layouts and 24 template regions drawn again, and at least 23 sections reused per layout; a remote keystroke in 1600 blocks relays at most one section and measures at most five blocks; at most three browser layouts per wheel event on 5 pages and on 40; and a keystroke on 40 pages restyles at most three times as many elements as on 5. A budget not met yet is an expected failure naming its gap in the port plan.

Implementation: `e2e/budgets.ts`
Verification: `e2e/budget-counters.performance.spec.ts`

## DOCE-LABS-3 - Editor labs

### DOCE-LABS-3.1 - The template editor beside a document

The template editor lab shall show the template editor beside the document editor, a template inheriting from the base template, each change restyling the document at once.

Implementation: `labs/src/template-editor.lab.tsx`, `labs/template-editor.html`
Verification: `e2e/template-editor.spec.ts`

### DOCE-LABS-3.2 - The full editor

The full editor lab shall show the document editor with every feature on, as a host assembles it: the comments margin over the in-memory host's comment store, suggest mode and how suggestions show, proofing with two proofers, find and replace, zoom, the toolbar, status bar and scrolling frame, the host's own toolbar items, context menu entries and locked paragraph, collaborators' carets, an agent working through the automation API, figures and linked code through the in-memory host's assets and code source, references and abbreviations through its citations and glossary, and the outline and search panels.

Implementation: `labs/src/full-editor.lab.tsx`, `labs/full-editor.html`
Verification: `e2e/full-editor.spec.ts`

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

A long ordered list shall split between items, each item shown once and numbered on from page to page; a nested list and an item longer than a page split and show every stored item; and a split item's continuation draws no empty line where it opens.

Implementation: `labs/src/regression/regression-documents.ts`
Verification: `e2e/regression.spec.ts`

### DOCE-LABS-4.4 - Tables

A long table shall split between rows, each body row on one page only, with its header rows on every page when its section repeats them, on the first page when it does not, and on none when it has none; a continuation without a repeated header repeats the caption; both header modes, merged cells and rich cells lay out.

Implementation: `labs/src/regression/regression-documents.ts`
Verification: `e2e/regression.spec.ts`

### DOCE-LABS-4.5 - Code

A 150-line listing shall split at line breaks, each line on one page only, each fragment numbering its lines on from the last; a quoted code block longer than a page splits inside its quote.

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
