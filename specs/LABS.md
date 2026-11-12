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

The stress labs shall show a generated document, the same on every load, in the document editor with its toolbar, status bar and scrolling frame, proofed by a word-list proofer, filling the window below their controls: `stress-long`, a very long document of varied content (headings at three levels, text with footnotes, nested lists, tables, code, quotes and rules after a table of contents) in sizes up to a few hundred pages; `stress-tables`, many kinds of tables (small, wide, tall across pages, merged cells, sized columns, long cell text, back to back and in runs) in sets; and `stress-pagination`, the cases pagination finds hardest (a paragraph, a code block, a list and a quote longer than a page, a run of headings, many and long footnotes on one page, page breaks in a row, empty paragraphs, a table row taller than a page and many short blocks). Every page holds its content.

Implementation: `labs/src/stress/stress-documents.ts`, `labs/src/stress/stress-lab.tsx`, `labs/src/stress-long.lab.tsx`, `labs/src/stress-tables.lab.tsx`, `labs/src/stress-pagination.lab.tsx`
Verification: `e2e/stress.spec.ts`

### DOCE-LABS-2.2 - Layout times

A stress lab shall report how many text blocks its document holds and how long its pages took to lay out, from the start and from the latest edit, and build a larger document from its size picker.

Implementation: `labs/src/stress/stress-lab.tsx`
Verification: `e2e/stress.spec.ts`

### DOCE-LABS-2.3 - Budgets

`npm run test:perf` shall measure the performance budgets on the scale lab (`e2e/performance.spec.ts`, run apart from `npm run test:labs` as the `budgets` project), with the browser's own counters (`Performance.getMetrics`, a trace's restyled elements) and the pagination's (`layoutStats`), and report each metric beside its target, as a table and in `test-results/performance.json`. The budgets are targets: the harness records and does not fail on them yet. Time budgets are measured on the development machine; counter budgets do not depend on it.

| Budget                         | Metric                                                                                                                         | Target                            |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------- |
| Single section, 5000 blocks    | Pages; first settled time                                                                                                      | ≥ 300 pages; the time is recorded |
| Multi-section, 25 × 200 blocks | After an edit mid-document: layouts until settled; template regions drawn again; sections reused per layout (`sectionsReused`) | ≤ 4; ≤ 24; ≥ 23 of 25             |
| Remote keystroke, 1600 blocks  | Per keystroke: sections relaid (`sectionsRelaid`); blocks measured (`blocksMeasured`)                                          | ≤ 1; ≤ 5                          |
| Wheel scroll                   | Browser layouts per wheel event, on 5 and 40 pages                                                                             | ≤ 3, no growth with the pages     |
| Typing style scope             | Elements restyled per keystroke, 40 pages against 5                                                                            | ≤ 3 times                         |
| Keystroke latency              | p95 from a key's press to the frame after it is drawn, on 40 and 300 pages                                                     | ≤ 16 ms; ≤ 32 ms                  |
| Load, 24 pages                 | `whenSettled` time from navigation over five loads: median, p95                                                                | ≤ 6 s; ≤ 12 s                     |

Two budgets wait for their phases: typing beside 500 comment threads on 300 pages, and a text-only change walking no untouched section, which a unit test will check.

Implementation: `e2e/performance.spec.ts`, `labs/src/stress/stress-probe.ts`, `playwright.config.ts`, `package.json`
Verification: `e2e/performance.spec.ts`

### DOCE-LABS-2.4 - Scale lab

The `stress-scale` lab shall show the documents the budgets name, picked by its size picker or the page's `size` query parameter: about 5, 24, 40 and 300 pages in one section, one section of 5000 blocks, 25 sections of 200 blocks and 1600 blocks in eight sections, each the same on every load; and offer a remote writer typing into the middle of the document (Remote typist). Each stress lab shows the harness its editor's layout state and counters, when its pages first settled, and a way to type as a remote writer (`window.stressLab`).

Implementation: `labs/src/stress-scale.lab.tsx`, `labs/stress-scale.html`, `labs/src/stress/scale-documents.ts`, `labs/src/stress/stress-probe.ts`, `labs/src/stress/stress-lab.tsx`
Verification: `e2e/stress.spec.ts`, `e2e/performance.spec.ts`

## DOCE-LABS-3 - Editor labs

### DOCE-LABS-3.1 - The template editor beside a document

The template editor lab shall show the template editor beside the document editor, a template inheriting from the base template, each change restyling the document at once.

Implementation: `labs/src/template-editor.lab.tsx`, `labs/template-editor.html`
Verification: `e2e/template-editor.spec.ts`

### DOCE-LABS-3.2 - The full editor

The full editor lab shall show the document editor with every feature on, as a host assembles it: the comments margin over the in-memory host's comment store, suggest mode and how suggestions show, proofing with two proofers, find and replace, zoom, the toolbar, status bar and scrolling frame, the host's own toolbar items, context menu entries and locked paragraph, collaborators' carets, an agent working through the automation API, figures and linked code through the in-memory host's assets and code source, references and abbreviations through its citations and glossary, and the outline and search panels.

Implementation: `labs/src/full-editor.lab.tsx`, `labs/full-editor.html`
Verification: `e2e/full-editor.spec.ts`
