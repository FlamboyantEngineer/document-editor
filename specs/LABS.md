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

`npm run test:perf` shall measure the performance budgets on the scale lab (`e2e/performance.spec.ts`, run apart from `npm run test:labs` as the `budgets` project), with the browser's own counters (`Performance.getMetrics`, a trace's restyled elements) and the pagination's (`layoutStats`), and report each metric beside its target and whether it meets it, as a table and in `test-results/performance.json`. The typing budgets on 40 and 300 pages, the remote typing budget and the remote typing budget while changes show (`?compare` on the scale lab) are enforced: each is measured on every key's own work (`keystrokeWork`), from the key's press until its input is handled and from the start of the frame that draws it until that frame is drawn, without the wait for that frame, and a test fails on a missed one; remote typing is measured from a remote writer's keystroke reaching the editor, one every 100 ms into the middle of the document, to the frame after it is drawn, since remote changes repaint at once with no fixed tick. The typing on 40 and 300 pages is also recorded with `textLayout=pretext` (DOCE-PAGINATION-11.5), not yet enforced. The other budgets are targets until the pagination phase ends: the harness records and does not fail on a missed one. Time budgets are measured on the development machine; counter budgets do not depend on it.

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

A text-only change shall walk no section it does not change, through every editing plugin: a plugin that follows changes reads only the nodes they reached (`changedNodes`), and paragraph numbering keeps its numbers, moved with the change, when typing leaves every paragraph with or without its numbering content. A unit test fails on any walk of an untouched section's children, descendants or a range of them.

Implementation: `e2e/budgets.ts`, `e2e/performance.spec.ts`, `labs/src/stress/stress-probe.ts`, `playwright.config.ts`, `package.json`, `src/utils/changed-ranges.ts`, `src/engine/paragraph-numbering.ts`, `src/engine/scripts.ts`, `src/engine/table-width.ts`
Verification: `e2e/performance.spec.ts`, `src/engine/text-change-locality.test.ts`, `src/engine/paragraph-numbering.test.ts`

### DOCE-LABS-2.4 - Scale lab

The `stress-scale` lab shall show the documents the budgets name, picked by its size picker or the page's `size` query parameter: about 5, 24, 40 and 300 pages in one section, one section of 5000 blocks, 25 sections of 200 blocks, 1600 blocks in eight sections, about 300 pages beside 500 open comment threads, and about 100 pages of short lists (a paragraph and a list of eight items or fewer each, ordered and bulleted in turn, some nested), to profile list pagination apart from long lists, each the same on every load; on the layout engine's lines when the `textLayout` query parameter is `pretext` (DOCE-PAGINATION-11); and offer a remote writer typing into the middle of the document (Remote typist). Each stress lab shows the harness its editor's layout state and counters, when its pages first settled, and a way to type as a remote writer, a character at a time or up to the end of a line (`window.stressLab`).

Implementation: `labs/src/stress-scale.lab.tsx`, `labs/stress-scale.html`, `labs/src/stress/scale-documents.ts`, `labs/src/stress/stress-probe.ts`, `labs/src/stress/stress-lab.tsx`
Verification: `e2e/stress.spec.ts`, `e2e/performance.spec.ts`, `e2e/regression.spec.ts`

### DOCE-LABS-2.5 - Counter budgets

The budgets counted in layouts, sections, blocks and restyled elements rather than time do not depend on the machine, and `npm run test:labs` shall hold them on every pull request, measured as the harness measures them (`e2e/budgets.ts`): after an edit in the middle of 25 sections, at most four layouts and 24 template regions drawn again, and at least 23 sections reused per layout; a remote keystroke that starts a new line in 1600 blocks relays at most one section and measures at most five blocks, and one inside a line lays nothing out; at most three browser layouts per wheel event on 5 pages and on 40; at most 8 page boxes read per wheel event on 5 pages and 12 on 40 to tell the page in view, which a scan of every page would exceed; and a keystroke that keeps its block's height on 40 pages restyles at most three times as many elements as on 5, and keeps the height, and an Enter there restyles at most 800 elements; opening 24 pages settles in at most two layouts, measures each block once, and lays out nothing in the second after. A budget not met yet is an expected failure naming its gap in the port plan.

Implementation: `e2e/budgets.ts`
Verification: `e2e/budget-counters.performance.spec.ts`

## DOCE-LABS-3 - Editor labs

### DOCE-LABS-3.1 - The template editor beside a document

The template editor lab shall show the template editor beside the document editor, a template inheriting from the base template, each change restyling the document at once. Host options mark the template as never saved, fail its parent's load, disable the editor and put a table in the header and footer; the lab offers its own fonts, reports section renames, and shows the template it holds as JSON, read only.

Implementation: `labs/src/template-editor.lab.tsx`, `labs/template-editor.html`
Verification: `e2e/template-editor.spec.ts`

### DOCE-LABS-3.2 - The full editor

The full editor lab shall show the document editor with every feature on, as a host assembles it: the comments margin over the in-memory host's comment store, suggest mode and how suggestions show, proofing with two proofers, find and replace, zoom, the toolbar, status bar and scrolling frame, the host's own toolbar items, context menu entries and locked paragraph, collaborators' carets, an agent working through the automation API, figures and linked code through the in-memory host's assets and code source, references and abbreviations through its citations and glossary, and the outline and search panels.

Implementation: `labs/src/full-editor.lab.tsx`, `labs/full-editor.html`
Verification: `e2e/full-editor.spec.ts`

### DOCE-LABS-3.3 - Host services mimicked in the page

The host services lab shall mimic in the page each host service that needs a backend, so a person can try it by hand: embedded content the host keeps (`EmbedSourceAdapter`), a table in the body and one in an appendix whose template section sets its own table colors, and one value inline in a heading, which the controls change, remove or deny at the host and the writer checks and takes in again; the host's variables in the page headers (`VariablesAdapter`), changed while the document is open; font loading (`FontsAdapter`) that is immediate, slow or failing; and logs of what the editor measured (`TelemetryAdapter`) and told the reader (`FeedbackAdapter`). The editor shows the host's zoom levels, symbols and code languages, and can be hidden (`active`).

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

The side panels lab shall show the panel at the document's start controlled by the host (its selected pane, whether it shows and its width between a narrowest and widest, each change reported) or left to itself, remembering its pane, expanded state and width across reloads under a key through the page's storage; and the outline, search, properties and contributors panes on their own beside the document, the outline leaving out the title or collapsing the headings below a level. Its document ends in a nested heading longer than the widest panel, which the outline keeps on one line with its number leading, clipped at its end, and with no sideways scrolling, at the narrowest width and the widest.

Implementation: `labs/src/panels.lab.tsx`, `labs/panels.html`
Verification: `e2e/panels.spec.ts`

### DOCE-LABS-3.7 - Template content in place

The template content lab shall show a template's preview in parts beside the template as JSON: a read-only sample, then each template section's content and placeholder, edited in place with the toolbar and its variable menu, and the headers and footers, each edit written into the template. Its template sets caption and footnote typography, which a read-only appendix section overrides in part, citing a footnote and showing two narrow captioned tables, one aligned right, their captions centred.

Implementation: `labs/src/template-content.lab.tsx`, `labs/template-content.html`
Verification: `e2e/template-content.spec.ts`

## DOCE-LABS-4 - Regression labs

The pagination regression scenarios lay out the regression set's documents (`test/fixtures/documents/`) and check the pages a reader sees and the document the writer would store. A scenario the editor does not pass yet is an expected failure that names its gap in the port plan; it passes once that work lands, and its mark comes off then. The scenarios run with `npm run test:labs`, and on every pull request.

### DOCE-LABS-4.1 - The regression lab

The `regression` lab shall show a document of the regression set on its template's pages, the template resolved through the set's templates on the base template, in the document editor with its scrolling frame and status bar, picked by its Document picker or the page's `document` query parameter, in the web layout when the `layout` query parameter is `web`, and on the layout engine's lines when the `textLayout` query parameter is `pretext` (DOCE-PAGINATION-11), on a projection of the document (DOCE-PAGINATION-7.17), with quotes drawn by a host's React view, taller than the schema draws them, when it has a `hostViews` one. It shows the scenarios the document as it would be stored, puts a caret at a split block's fragment boundary, by the position the caret has once the pages are joined whole, gives the pages as a snapshot for printing (`snapshot`, DOCE-EDITOR-6.19), and gives the lines the engine computed for each page (`textLines`) and the forced blocks the browser drew on other lines (`wrappedLines`), and draws every page on the engine's lines (`drawAllLines`) (`window.regressionLab`). Every document lays out on pages that hold their content, as many as the status bar counts.

Implementation: `labs/src/regression.lab.tsx`, `labs/regression.html`, `labs/src/regression/regression-lab.tsx`, `labs/src/regression/host-quote-view.tsx`, `labs/src/regression/regression-documents.ts`, `labs/src/regression/regression-probe.ts`
Verification: `e2e/regression.spec.ts`, `e2e/print.spec.ts`, `e2e/text-layout.spec.ts`

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

The reference stylesheet shall align a figure's caption text where the figure is aligned (left, centred or right), the caption spanning the content width; label and number linked code as it does code, its text the name of its source, counting each linked code once however the pages split it; draw a table set to `table-border-1px` with one pixel lines in the template's border colour; give a page header's and footer's table cells no padding; and set a template image in a table cell with no paragraph indent.

Implementation: `labs/reference/document.css`
Verification: `e2e/regression.spec.ts`, `e2e/template-content.spec.ts`

## DOCE-LABS-5 - Pretext pagination spike

### DOCE-LABS-5.1 - DOM-free prediction and virtual pages

The Pretext pagination lab shall read stored document fixtures through the editor schema and predict page dimensions and source ranges in a worker. It shall reuse prepared inline data on width changes, reuse item-local line offsets at the same width, and discard both when font readiness changes. The read-only viewer shall render only the visible pages and the chosen overscan, support jumping by page number and report unsupported content explicitly. The experiment shall leave production rendering, pagination, and editing unchanged.

Implementation: `labs/src/spikes/pretext-pagination.lab.ts`, `labs/src/spikes/pretext/worker.ts`, `labs/src/spikes/pretext/prediction.ts`, `labs/src/spikes/pretext/html.ts`
Verification: `e2e/pretext-pagination.spec.ts`

### DOCE-LABS-5.2 - Independent HTML parity

The lab shall compare its predictions against natural HTML line layout at multiple widths, including line counts, source start offsets, block box dimensions, page boundaries, and page overflow. It shall verify page and content dimensions, fragmentation, and vertical placement for every rendered page of the text, list and mixed stress documents. It shall check exact source offsets on both sides of a wrap threshold and in naturally rendered split paragraphs, including consecutive hard breaks and mixed inline objects. The identified 300-page text fixture shall also be checked against the production projection at both benchmark widths. It shall report real discrepancies, unsupported content and stored-content preservation.

Implementation: `labs/src/spikes/pretext/oracle.ts`, `labs/src/spikes/pretext/fixtures.ts`
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

The lab tests shall measure how close the prediction is to Chromium's own line breaking. Seeded paragraphs of plain text, words that kern with a following space, bold, italic, inline code, links and a dense mix shall be laid out at nine widths by the worker and by natural HTML, and the paragraphs with different line starts or line counts, the pages with different boundaries and the overflowing pages shall equal a recorded budget per kind. The same run shall happen in Chromium launched at device pixel ratios 1, 1.25 and 2, each checking that the page reports its ratio. A threshold test shall find, in the browser and in the prediction, the narrowest column that keeps a case's last character on its first line: plain controls shall match, and each case of a known fault shall be recorded as an expected miss naming its finding, so a fix fails the test until its miss and budgets are updated.

Implementation: `labs/src/spikes/pretext/thresholds.ts`, `labs/src/spikes/pretext-pagination.lab.ts`, `playwright.config.ts`
Verification: `e2e/pretext-pagination-fuzz.spec.ts`

## DOCE-LABS-6 - Forced-lines spike

### DOCE-LABS-6.1 - Pretext lines in the live editor

The forced-lines lab shall show the document editor on pages with every top-level paragraph and heading drawn on the lines Pretext computes for it: each line except a block's last ends in a forced break, centred and right-aligned lines start after the room Pretext left them, and justified lines stretch their spaces to the column, so the browser neither wraps nor aligns a line itself. The lines shall follow each keystroke at once. Arrow Up and Down shall move one drawn line and keep the column, Home and End shall stay on the line, a caret at a line's start shall stay drawn there when the editor writes the selection itself (as after an edit), unless the browser last drew it at the line above's end, double and triple clicks shall select a word and the paragraph, and composition, copy and paste, find, proofing, suggestions, bidirectional text and paragraphs split across pages shall keep the drawn lines. The lab shall draw the lines either as canonical decorations or on the pages' own view, and its guard (`window.forcedLines.check()`) shall report any block whose drawn lines differ from the breaks placed. The lab shall offer no inline completion, whose offer Pretext does not lay out. The experiment shall leave the library unchanged.

Implementation: `labs/forced-lines.html`, `labs/src/forced-lines.lab.tsx`, `labs/src/spikes/forced-lines/`
Verification: `e2e/forced-lines.spec.ts`

### DOCE-LABS-6.2 - Typing with forced lines

With the lines drawn on the pages' own view and pages off screen skipping their layout, each keystroke on 40 and 300 pages shall meet the typing budgets of DOCE-LABS-2.3, measured beside the same documents with the browser's own lines, as the middle of three rounds of each, taken in turn.

Implementation: `labs/src/spikes/forced-lines/direct.ts`, `labs/forced-lines.html`
Verification: `e2e/forced-lines.performance.spec.ts`

## DOCE-LABS-8 - One layout result

### DOCE-LABS-8.1 - Computed lines and pages are the drawn ones

With `textLayout: 'pretext'`, the regression lab shall show (`window.regressionLab.textLines()`) the layout engine's result: page by page, each text block fragment it laid out with the lines it draws on that page, and each block it left to the DOM with the reason. For every document of the regression set, at zooms of 50, 75, 100, 125 and 150 percent at a device pixel ratio of 1, and of 50, 100 and 150 percent in Chromium launched at device pixel ratios 1.25 and 2, the editor shall draw as many pages as computed, each page shall draw exactly the forced blocks the engine put on it, and each block's drawn lines, read from the line boxes its own characters sit on, shall equal the computed lines in count and text. A block drawn in a narrower column than its lines were fitted to shall fail the check. The regression lab shall take a `zoom` query in percent.

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
