# Paged projection spike: findings

The spike tries the paged projection method (PG-40, P0-9) on the library's own code. It lives in this folder and its lab, `labs/spike-projection.html`.

- **Canonical state.** The whole document, each section on one page with whole blocks, as `joinDocumentPages` gives it today. It runs as an `EditorState` with no view, and holds the undo history.
- **Projection.** A read-only `EditorView` shows the pages, built by `projectDocument` and moved by `repaginate`. Its dispatch takes only layouts and edits mirrored from the canonical state.
- **Ghost.** A hidden view renders the canonical document. The pages are laid out from it once the writer pauses (150 ms, at most 600 ms).
- **Map.** `ProjectionMap` maps positions between the two documents through the page transform's step maps. Each mirrored edit extends the map, and each layout rebuilds it.

**Result: all six checks pass, and nothing found calls for a change of method.** The findings below are what W3.0 has to build in. Each one names what the spike does about it.

## The checks

| #   | Check                                                                  | Result                                                                     | Where                                                                   |
| --- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 1   | Caret, arrows, selection, Backspace and Enter across a split paragraph | Pass                                                                       | `e2e/spike-projection.spec.ts`                                          |
| 2   | Cell selection and column resize across a split table                  | Pass                                                                       | same                                                                    |
| 3   | IME composition and spellcheck at a page break                         | Pass (Chromium)                                                            | same                                                                    |
| 4   | Undo across a repagination                                             | Pass, by construction                                                      | same                                                                    |
| 5   | Typing p95 ≤ 32 ms at 300 pages                                        | Pass: **17 ms** (today's editor: 18 ms)                                    | `e2e/spike-projection.performance.spec.ts`, alone after the other tests |
| 6   | Exact position mapping on generated edits (property test)              | Pass: 60 generated layouts, then 1,000 generated edits mirrored either way | `projection-map.test.ts`                                                |

### Measurements at 300 pages

These are from headless Chromium, typing 176 keys 60 ms apart in the middle of the document, and then at a page break.

|                                                                      | Spike               | Today's editor   |
| -------------------------------------------------------------------- | ------------------- | ---------------- |
| Key press to next frame, p50 / p95 / max                             | 13 / 17 / 50 ms     | 13 / 18 / 31 ms  |
| Same, typing at a page break                                         | 11 / 16 / 44 ms     | 11 / 18 / 68 ms  |
| Layout (ghost, measure, project, repaginate, rebuild map), p50 / max | 74 / 105 ms         | not instrumented |
| Long tasks during typing, p50 / max                                  | 84 / 114–135 ms     | 91 / 473–675 ms  |
| Map rebuilt from the page transform                                  | 25–30 ms            | none             |
| Longest the map grew between two layouts                             | about 800 step maps | none             |

Playwright waits for each key to be handled, so the key latency leaves out time spent waiting behind a layout. A key pressed during a layout waits for that layout to finish. The long-task row gives that bound: about 100 ms at 300 pages, every 600 ms of continuous typing, in both editors. Moving layout off the typing path (measuring in slices, or in idle time) is P3 work either way.

## Findings

### 1. The page transform is exact for content text, but not for footnote entries or repeated header rows

The joining steps delete only page and fragment boundaries, so every character of the content maps exactly both ways. Joining does two other things, and positions inside them map nowhere:

- It **moves footnote entries** onto the last page. The entries on every other page are deleted from the map.
- It **drops the header rows** a table continuation repeats.

The spike looks these positions up again by footnote id and by row index, at the same offset (`redirect` in `projection-map.ts`). This is the kind of guess the plan wanted the step maps to avoid. It is narrow, though, and the property test covers it. W3.0 can keep it as a documented part of the map, or change the page transform so entries and repeats keep positions that map.

### 2. An edit to a header row has to reach every repeated copy

When a header row changes in the first part only, its repeats no longer match. Joining then keeps them as body rows, and the pages stop joining into the canonical document (PG-36 in its projection form). The spike mirrors such an edit onto the first part's row and onto each copy (`headerCopies`). An edit typed into a copy goes to the canonical header first and comes back the same way.

### 3. A deletion across a page break must be mirrored page by page

A canonical deletion inside one paragraph whose range crosses a page break, mirrored as one step, joins the two pages. That drops the footnotes, footer and header between them. The property test found this. The spike deletes each page's piece on its own (`mirrorAcrossBreaks`). Any canonical step that spans pages needs the same split.

### 4. Both sides of a page break are one canonical position

- **Arrows.** The browser's ArrowLeft or ArrowRight from one side of the break to the other does not move the canonical caret, so that key is lost. The spike moves one character on the canonical state instead (`crossBreak`).
- **Sides.** A position at the end of a part keeps to the text before it (`side`). Without that, text typed at the end of page 1 lands after text typed earlier at the start of page 2.
- **Map edges.** Two insertions at one canonical position, one on each side of the break, leave their order to the edges of the extended map's ranges, and those edges do not keep it. After an edit at a break, the spike rebuilds the map from the page transform: 25–30 ms at 300 pages, once per burst at a break. **W3.0 should make the page transform give a map per page or per section**, so a rebuild covers one page.

### 5. Changes the browser makes in the DOM cannot be refused without redrawing under the writer

Typing, IME composition, spellcheck replacements and drag and drop change the DOM before ProseMirror reads them. If the projection refused them and waited for the mirror, the writer's DOM would be redrawn mid-composition. The spike splits input two ways:

- **Keys that edit and paste** run as commands on the canonical state: Enter, Backspace, Delete, undo, redo and marks. Backspace and Delete fall back to deleting one character, which the browser would otherwise do in the DOM.
- **DOM changes** are mapped step by step onto the canonical state and paired with it. The projection refuses one only when a step does not map, and then draws it again.

Layouts never land during a composition.

### 6. The projection's selection has to be read before routing anything

- The browser reports a caret an earlier key moved a moment late, so key handling first flushes the view's DOM observer (`readDomSelection`).
- The end of a composition does not always send a selection transaction, so each DOM change syncs the selection first.
- A selection that only followed the edit, as typing's does, follows the canonical edit too. Mapping it across the break could put it on the wrong side of new text.

### 7. Undo needs nothing

The history lives only on the canonical state, and layouts never touch it. Undo across any number of repaginations is right by construction, and PG-29 and PG-36 disappear for the reason the plan gives.

### 8. Split tables

- **Cell selection.** The projection cannot hold a cell selection spanning two parts, which are two tables there. The spike drags a `CellSelection` on the canonical table and draws it as `selectedCell` decorations on every part.
- **Column resize.** prosemirror-tables' column resizing changes one part. The spike reads which column changed and sets that width on the canonical table, so every part follows.
- **Rendering.** `columnResizing` must run with `View: null`. Its default `TableView` renders different DOM from the ghost, and the measurements stop matching.

### 9. Something to look at in today's editor

At 300 pages, typing 20 characters on page 150 of today's editor (`?mode=current`) lays out untouched pages differently. Page 1's paragraph with a footnote splits where it did not before, and the document goes from 300 to 281 pages. The spike's layout stays as it was on load. The spike did not look into why. It is likely the footnote room measured from the joined editing document; W3.0 replaces that path anyway.

## Not covered

- Drag and drop goes through the DOM path and paste through a canonical command, but neither has a test.
- IME and spellcheck ran only in Chromium, through CDP composition and a direct DOM text change. Firefox and Safari did not run.
- Which plugins run where is still open. Decoration plugins (proofing, search, comments, presence) belong on the projection and need positions through the map. `appendTransaction` plugins (element ids, footnote numbering, table fixing) belong on the canonical state.
- Deleting a cell selection with a key is not routed yet.
- The canonical document keeps today's page wrapper: each section on one page. W3.0 decides whether it keeps that.

## For W3.0

- Start from `projection-map.ts` (the map, its redirects, header copies and page-by-page deletions) and `projection-editor.ts` (routing, selection mirroring, cell selection, column width, layout).
- Port `e2e/spike-projection.spec.ts` and the property test into the regression labs.
- Make the page transform give per-page maps (finding 4), and decide about footnote entries and repeated rows (finding 1).
