# Pretext pagination spike

**Extend the experiment for large read-only documents.** With 4,420 distinct text blocks, the first page painted in 339.5 ms median versus 762.8 ms for production. The two matched across all 312 pages by count, and the independent HTML oracle matched every source boundary. Cold startup still costs more on three- and 24-page documents. Verify downloadable fonts, another browser engine and currently unsupported document structures before adopting the viewer.

## Run it

Run `npm run labs` and open `/pretext-pagination.html` on the URL the server prints. The full editor opens by default. Choose any document, including the full pagination stress case. Right-click text to comment, or select **Suggesting** in the formatting toolbar to track an edit. The editor uses production pagination. Drafts, undo history and review threads stay in memory when switching documents or views and are discarded on reload.

The lab index also links to **Pretext virtual pages · Open page 150** at `/pretext-page-link.html#page=150`. This dedicated reader indexes the long fixture and mounts the destination window on its first render. Its status shows the page in view and the actual number of mounted page elements as you scroll. The fragment can be bookmarked or shared.

Choose **Pretext preview** to paginate the current draft in the worker. The preview shows inline review marks and **Check HTML parity** compares that draft to natural HTML. For the standalone viewer, open `/pretext-pagination.html?view=preview`. Choose **Long document**, enter page 271, and select **Go to page**. The default overscan is one page on each side. **Check HTML parity** on the formatting examples displays line, height, page boundary, and overflow differences. Use the Reference stylesheet for the experiment's sizing rules.

```sh
npm run build:labs
CHROMIUM_PATH=/usr/bin/chromium npx playwright test e2e/pretext-pagination.spec.ts e2e/pretext-pagination-stress.spec.ts e2e/pretext-pagination-editor.spec.ts e2e/pretext-page-link.spec.ts --project=chromium --workers=1
PRETEXT_BENCH=1 CHROMIUM_PATH=/usr/bin/chromium npx playwright test e2e/pretext-pagination.performance.spec.ts --project=performance --no-deps --workers=1 --reporter=json > /tmp/pretext-benchmark.json
```

Omit `CHROMIUM_PATH` when using Playwright's installed browser. The last command records raw samples as a JSON attachment. The checked-in CSV contains every sample used in the table. [Benchmark samples](pretext-pagination-samples.csv)

## Prediction and HTML parity

The lab reads stored fixtures through the editor schema and resolves the base template's typography and page metrics. The worker takes a stored document and returns page dimensions and ordered ranges in original block coordinates. The viewer serializes only fragments in the viewport window. Source ranges use ProseMirror offsets, including inline atoms. Rendering cuts source content at page boundaries and allows the HTML on each page to wrap naturally.

The lab installs `@chenglou/pretext` as a development dependency from the FlamboyantEngineer fork. To test a fork change, update the commit in `package.json` and regenerate the lockfile with `npm install --strict-peer-deps`. [Pinned fork revision](https://github.com/FlamboyantEngineer/pretext/commit/cf2bc58891fc63748bef8824da90443edf6b9bb0)

The package exposes `prepareRichInline`, `walkRichInlineLineRanges`, and `materializeRichInlineLineRange` through `@chenglou/pretext/rich-inline`. The materialized fragments report item-local UTF-16 offsets and the API accepts fixed-width boxes. It provides line advances. The adapter supplies explicit line-box heights and all vertical geometry. The package can insert an emoji calibration span and read its DOM geometry in a document. A dedicated worker prevents this probe and uses Canvas from `OffscreenCanvas`. The worker retains preparation by text, font and whitespace policy across widths. Each prepared run also retains its item-local line offsets for its most recent width. A change of width replaces that layout. Each use maps the offsets back to its own source block. The lab waits for font readiness and restarts prediction on subsequent load or error events. The scope uses system fonts and needs no worker font registration.

The oracle serializes the original blocks into a separate column with the same reference rules and natural browser wrapping. It compares rendered block widths and heights, line counts, and source starts. It then feeds browser dimensions into the shared page packer. A second pass mounts one virtual page at a time and checks the outer and content boxes, each fragment's width, height and top offset, and page overflow. The split fragments also undergo an independent grapheme-range scan in their rendered pages, including fragments whose height and line count match. The production projection supplies a second boundary oracle on the three-page fixture and on all 300 pages of the long fixture, then all 320 after narrowing. Geometry reads run on explicit verification. The preview lets browsers wrap lines naturally.

| Content width | Boxes compared | Line count and start differences | Height differences | Predicted / HTML pages | Boundary differences / overflow pages |
| ------------: | -------------: | -------------------------------: | ------------------ | ---------------------: | ------------------------------------: |
|        600 px |             64 |                                0 | 0                  |                  4 / 4 |                                 0 / 0 |
|        510 px |             64 |                                0 | 0                  |                  4 / 4 |                                 0 / 0 |
|        375 px |             64 |                                0 | 0                  |                  5 / 5 |                                 0 / 0 |

Box dimensions and positions use a 0.5 px tolerance. Line counts and source offsets compare exactly. In collapsed whitespace the line start is its first visible grapheme or inline atom. Preserved whitespace and explicit breaks retain their source offsets. The lab's inline code now preserves the surrounding line box. This resolves the two previous mixed-font height discrepancies, which added 1 px per line. The stored documents serialize identically before and after verification.

The checked subset covers paragraphs, headings, bold and italic, links and inline code, long words, collapsed whitespace and hard breaks, CJK, Arabic and emoji, nested bullet and ordered lists, pre-wrapped code, fixed-size images, simple fixed-width tables, and fixed-size inline and display math. Table rows take the tallest cell height. Math boxes display source as a placeholder with fixed geometry.

## Stress parity

Choose a stress document and select **Check HTML parity**. The text and list workloads use the original scale fixtures. The distinct-text variant adds a numbered opening sentence to every block so a cold run has 4,420 distinct inputs. The mixed document combines the pagination fixture’s long paragraph, heading run and empty paragraphs with 18 groups of formatting examples. The fragmentation case puts consecutive hard breaks, trailing collapsible whitespace, styled text, emoji, CJK and inline math in paragraphs that span several pages.

| Stress document | Content widths (CSS px)                         | Pages | Rendered fragments | Lines inside splits |
| --------------- | ----------------------------------------------- | ----: | -----------------: | ------------------: |
| text            | 601.6875, 600.984375, 601, 601.015625, 600, 480 | 1,855 |             26,786 |               1,116 |
| distinct        | 601.6875, 481.6875                              |   681 |              9,156 |               1,408 |
| lists           | 601.6875, 601, 600, 480                         |   460 |              4,609 |                  70 |
| fragments       | 601.6875, 601, 375.5                            |    19 |                 25 |                 870 |
| mixed           | 601.6875, 601, 600, 480, 375.5                  |   382 |              2,210 |              10,172 |

Each row sums the work over the listed widths. Across 20 document and width combinations, the line starts and source boundaries matched on all 3,397 pages. No page overflowed and every measured box stayed within the original 0.5 px tolerance. The split-line column counts source offsets checked a second time after cutting the paragraph and letting the browser wrap each piece naturally.

The previous experiment found line-offset differences in 60 blocks and two shifted page boundaries at 601 px. Its report attributed those failures to kerning. A reduced line whose Canvas advance is exactly 601.0078125 px fits in a 601 px Chromium column and wraps one layout unit below it. Blink grants one extra layout unit (1/64 px) when testing a line. Pretext 1.0.0 already grants 0.005 px. The worker supplies the difference for Blink’s fit decision. The recorded box width, CSS, and oracle tolerance are unchanged. The regression test includes the immediately narrower and wider widths. [Chromium 156 line breaker](https://github.com/chromium/chromium/blob/156.0.8078.79/third_party/blink/renderer/core/layout/inline/line_breaker.h#L308-L313)

A separate failure involved text containing only collapsible whitespace. In the natural HTML column, such a paragraph can have zero height and its margins can collapse through to siblings. The worker now reports that case as unsupported. An empty paragraph with the reference minimum height and whitespace following a final hard break are both supported.

The full pagination stress document also reports footnotes, page breaks, block quotes and oversized indivisible objects. This experiment uses one base template scope and two-line paragraph widow and orphan limits. Lists, code and tables stay whole. Custom template scopes, captions, merged cells, downloadable fonts and numbering geometry remain outside its scope. The browser measurements cover Chromium with the system fonts listed below.

## Closeness to the browser

`e2e/pretext-pagination-fuzz.spec.ts` measures how often the prediction breaks a line where Chromium does not (DOCE-LABS-5.6). For each kind of text it lays out four seeded documents of 120 paragraphs (30 to 80 words) at nine widths from 301 to 599.123 px, 4,320 paragraph layouts, and counts the paragraphs whose line starts or line counts differ, the pages whose boundaries differ and the pages that overflow in natural HTML. Projects `chromium-dpr-1.25` and `chromium-dpr-2` repeat it in Chromium launched with `--force-device-scale-factor`, because an emulated `deviceScaleFactor` leaves Chromium's layout unit unchanged. The counts are exact budgets: a pinned fork fix lowers them in the same pull request, and a rise fails the test.

| Text                                      |     Ratio 1 |  Ratio 1.25 |     Ratio 2 |
| ----------------------------------------- | ----------: | ----------: | ----------: |
| Plain                                     |   0 / 0 / 0 |   4 / 0 / 0 |   5 / 0 / 2 |
| One word in ten ending in A, L, T, Y or P | 16 / 3 / 24 | 19 / 3 / 24 | 18 / 3 / 24 |
| A quarter of the words bold               |  24 / 1 / 2 |  23 / 1 / 2 |  19 / 0 / 2 |
| A quarter italic                          |  21 / 1 / 3 |  21 / 1 / 3 |  14 / 1 / 3 |
| A quarter inline code                     |  19 / 2 / 4 |  19 / 2 / 6 |  16 / 2 / 6 |
| A quarter links                           | 45 / 4 / 19 | 46 / 4 / 19 | 41 / 4 / 19 |
| 60% styled, all kinds, with kerning words | 65 / 9 / 23 | 61 / 8 / 23 | 59 / 7 / 23 |

Each cell gives paragraphs with different line starts, paragraphs with a different line count and pages with a different boundary, out of 4,320 paragraphs. Pages overflow in the bold, italic, code, link and mixed runs: 1 or 2 per run.

A second test finds the narrowest column that keeps a case's last character on its first line, in the browser and in the prediction, in steps of 1/512 px. Plain sentences match at ratio 1. Each other case is an expected miss naming its cause, and passes only while it still misses:

- F1: a line-end word that kerns with the following space (A, L, T, Y, P in Arial) is charged the kerning on the space, where Chromium charges it to the word unless the text needs an accurate end position. Pretext needs 0.20 to 0.66 px more.
- F2: kerning between a space and the first letter of a link is dropped across the item edge although both resolve to the same font. Pretext needs 0.20 px more.
- F3: Chromium rounds each text item's piece of a line up to its layout unit; Pretext adds raw widths. Chromium needs up to one unit more per item.
- F4: the lab's `inlineFitWidth` allowance assumes a device pixel ratio of 1, where the unit is 1/64 px; at 1.25 and 2 plain lines can miss by less than a unit.

When a fix is pinned, remove its expected misses and lower the budgets to the counts the failure reports. The baseline is Playwright's Chromium on Linux with Liberation Sans standing in for Arial; a Playwright upgrade that changes the browser can move the counts.

## Benchmark

The recorded samples used the published `@chenglou/pretext@1.0.0` before the switch to the fork. Five paired runs per document alternated which implementation ran first. Chromium 156.0.8078.79 ran on Debian 13 with five available logical CPUs. Arial and Courier New resolved to Liberation Sans and Liberation Mono. Both paths awaited font readiness before timing. Loading the common lab bundle and generating the input fixture are outside the timed interval.

Cold Pretext starts a fresh worker and includes parsing in both contexts, transfer in both directions, line layout, packing, visible DOM creation and paint. Cold production includes its measuring editor, the projected document and applying the page DOM. The width change narrows the content from 601.6875 to 481.6875 CSS px in both paths. Pretext retains its worker and prepared runs. Production retains its editor and remeasures the document.

The table gives medians and the observed minimum–maximum for index readiness and completion. First paint uses the second animation frame after the first page DOM update. End waits for paint and layout settlement. Long tasks include main-thread tasks of at least 50 ms during the timed interval. Mounted nodes include the production measuring view.

| Document             | Path     | Run          |                 Index, ms | First paint, ms |                   End, ms | Long tasks / total ms | Mounted pages / nodes |
| -------------------- | -------- | ------------ | ------------------------: | --------------: | ------------------------: | --------------------: | --------------------: |
| Short                | Existing | Cold         |            5.6 (5.0–25.9) |            33.4 |          33.4 (33.2–33.4) |                 0 / 0 |               3 / 218 |
| Short                | Pretext  | Cold         |         59.1 (56.0–316.0) |            66.9 |         66.9 (66.6–335.0) |                 0 / 0 |                2 / 71 |
| Short                | Existing | Width change |          34.9 (34.4–38.3) |            50.0 |          66.8 (66.6–72.1) |                 0 / 0 |               4 / 223 |
| Short                | Pretext  | Width change |             1.7 (1.7–3.2) |            33.2 |          33.2 (33.1–33.3) |                 0 / 0 |                2 / 67 |
| Medium               | Existing | Cold         |          21.7 (19.9–26.3) |            50.1 |          50.1 (50.0–52.9) |                 0 / 0 |            24 / 1,651 |
| Medium               | Pretext  | Cold         |         67.4 (64.6–156.6) |            83.3 |         83.3 (67.9–166.6) |                 0 / 0 |                2 / 71 |
| Medium               | Existing | Width change |          58.2 (53.3–79.2) |            66.7 |         83.5 (66.7–100.1) |                 0 / 0 |            26 / 1,673 |
| Medium               | Pretext  | Width change |             4.0 (3.7–4.5) |            33.3 |          33.3 (33.2–33.4) |                 0 / 0 |                2 / 67 |
| Long, repeated       | Existing | Cold         |       343.8 (309.4–493.3) |           713.0 |     713.0 (627.5–1,015.2) |               2 / 711 |          300 / 20,711 |
| Long, repeated       | Pretext  | Cold         |       131.8 (111.6–152.6) |           135.1 |       135.1 (122.9–155.9) |                 0 / 0 |                2 / 71 |
| Long, repeated       | Existing | Width change | 1,431.8 (1,106.7–1,597.7) |         1,438.7 | 1,445.1 (1,115.1–1,600.0) |             3 / 1,431 |          320 / 20,971 |
| Long, repeated       | Pretext  | Width change |          27.5 (16.9–35.3) |            33.5 |          33.5 (33.2–66.7) |                 0 / 0 |                2 / 67 |
| Scale text           | Existing | Cold         |       388.6 (347.6–711.4) |           708.1 |     708.1 (660.1–1,147.1) |               2 / 707 |          300 / 19,257 |
| Scale text           | Pretext  | Cold         |       147.7 (137.9–172.2) |           158.1 |       158.1 (149.9–176.3) |                 0 / 0 |                2 / 69 |
| Scale text           | Existing | Width change | 1,079.6 (1,020.7–1,435.8) |         1,086.3 | 1,092.8 (1,033.0–1,455.9) |             3 / 1,080 |          354 / 19,651 |
| Scale text           | Pretext  | Width change |          18.1 (17.4–18.8) |            33.3 |          33.3 (33.2–33.4) |                 0 / 0 |                2 / 57 |
| Scale text, distinct | Existing | Cold         |       406.0 (401.0–484.8) |           762.8 |     762.8 (733.4–1,074.7) |               2 / 762 |          312 / 19,379 |
| Scale text, distinct | Pretext  | Cold         |       327.3 (305.0–436.4) |           339.5 |       339.5 (310.7–458.2) |                 0 / 0 |                2 / 65 |
| Scale text, distinct | Existing | Width change | 1,519.4 (1,402.3–1,795.4) |         1,521.2 | 1,533.5 (1,415.5–1,814.0) |             3 / 1,519 |          369 / 20,040 |
| Scale text, distinct | Pretext  | Width change |          35.8 (34.3–61.0) |            66.6 |          66.6 (38.1–71.1) |                 0 / 0 |                2 / 57 |

The two paths produced the same total page count in every cold and width-change run. The 4,800-block long fixture has 37 distinct rich-inline inputs. The original scale fixture has 791 across 4,420 blocks. Adding one unique sentence per block raises that to 4,420 and gives zero cold preparation hits. All three share vocabulary, so Pretext may still reuse individual word metrics. The gain from virtual pages persists as whole-paragraph reuse falls. The combined benchmark measures both prediction and virtualization.

For the distinct fixture, cold worker parsing and line layout took 252.3 ms median of the 327.3 ms end-to-end index time. The width change reused all 4,420 preparations and spent 27.2 ms on worker line layout. Only the two visible or overscan pages were mounted in these runs. Source nodes, preparations and the page index still grow with document size. The CSV records cumulative preparation hits and misses as well as worker timings for each measurement.
