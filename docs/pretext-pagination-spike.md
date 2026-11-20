# Pretext pagination spike

**Recommendation.** Extend the experiment. The 300-page text workload painted its first page about five times faster and mounted two of 300 pages. Cold startup was slower on both smaller documents. The tested stress corpus now matches Chromium's HTML geometry. The timing benchmark uses many repeated paragraphs. Measure less repetitive documents and verify additional browser and font combinations before considering production use.

## Run it

Start the lab with `npm run labs` and open [Pretext pagination](http://127.0.0.1:4183/pretext-pagination.html). Choose Long document, enter page 271, and select **Go to page**. The default overscan is one page on each side. **Check HTML parity** on the formatting examples displays line, height, page boundary, and overflow differences. Use the Reference stylesheet for the experiment's sizing rules.

```sh
npm run build:labs
CHROMIUM_PATH=/usr/bin/chromium npx playwright test e2e/pretext-pagination.spec.ts e2e/pretext-pagination-stress.spec.ts --project=chromium --workers=1
PRETEXT_BENCH=1 CHROMIUM_PATH=/usr/bin/chromium npx playwright test e2e/pretext-pagination.performance.spec.ts --project=performance --no-deps --workers=1 --reporter=json > /tmp/pretext-benchmark.json
```

Omit `CHROMIUM_PATH` when using Playwright's installed browser. The file from the last command includes the raw samples as a JSON attachment.

## Prediction and HTML parity

The lab reads stored fixtures through the editor schema and resolves the base template's typography and page metrics. The worker takes a stored document and returns page dimensions and ordered ranges in original block coordinates. The viewer serializes only fragments in the viewport window. Source ranges use ProseMirror offsets, including inline atoms. Rendering cuts source content at page boundaries and allows the HTML on each page to wrap naturally.

The pinned `@chenglou/pretext@1.0.0` exposes `prepareRichInline`, `walkRichInlineLineRanges`, and `materializeRichInlineLineRange` through `@chenglou/pretext/rich-inline`. The materialized fragments report item-local UTF-16 offsets and the API accepts fixed-width boxes. It provides line advances. The adapter supplies explicit line-box heights and all vertical geometry. The package can insert an emoji calibration span and read its DOM geometry in a document. A dedicated worker prevents this probe and uses Canvas from `OffscreenCanvas`. The worker retains preparation by text, font and whitespace policy across widths. The lab waits for font readiness and restarts prediction on subsequent load or error events. The scope uses system fonts and needs no worker font registration.

The oracle serializes the original blocks into a separate column with the same reference rules and natural browser wrapping. It compares rendered block widths and heights, line counts, and source starts. It then feeds browser dimensions into the shared page packer. A second pass mounts one virtual page at a time and checks the outer and content boxes, each fragment's width, height and top offset, and page overflow. A three-page text fixture also checks boundaries against the production projection. Geometry reads run on explicit verification. The preview lets browsers wrap lines naturally.

| Content width | Boxes compared | Line count and start differences | Height differences | Predicted / HTML pages | Boundary differences / overflow pages |
| ------------: | -------------: | -------------------------------: | ------------------ | ---------------------: | ------------------------------------: |
|        600 px |             64 |                                0 | 0                  |                  4 / 4 |                                 0 / 0 |
|        510 px |             64 |                                0 | 0                  |                  4 / 4 |                                 0 / 0 |
|        375 px |             64 |                                0 | 0                  |                  5 / 5 |                                 0 / 0 |

Box dimensions and positions use a 0.5 px tolerance. Line counts and source offsets compare exactly. The lab's inline code now preserves the surrounding line box. This resolves the two previous mixed-font height discrepancies, which added 1 px per line. The stored documents serialize identically before and after verification.

The checked subset covers paragraphs, headings, bold and italic, links and inline code, long words, collapsed whitespace and hard breaks, CJK, Arabic and emoji, nested bullet and ordered lists, pre-wrapped code, fixed-size images, simple fixed-width tables, and fixed-size inline and display math. Table rows take the tallest cell height. Math boxes display source as a placeholder with fixed geometry.

## Stress parity

Choose a stress document in the lab and select **Check HTML parity**. The automated checks cover the unmodified scale fixtures with 4,420 blocks and 560 lists. The mixed stress document combines the pagination fixture's long paragraph, heading run and empty paragraphs with 18 sets of formatting examples that vary image sizes, table column widths and code lengths.

| Stress document |         Content width | Boxes | Pages checked | Rendered fragments | Differences / overflow |
| --------------- | --------------------: | ----: | ------------: | -----------------: | ---------------------: |
| Text            | 601.6875 px (default) | 4,420 |           300 |              4,453 |                  0 / 0 |
| Text            |                600 px | 4,420 |           301 |              4,456 |                  0 / 0 |
| Text            |                480 px | 4,420 |           354 |              4,515 |                  0 / 0 |
| Lists           | 601.6875 px (default) | 7,683 |           110 |              1,150 |                  0 / 0 |
| Lists           |                600 px | 7,683 |           110 |              1,151 |                  0 / 0 |
| Lists           |                480 px | 7,683 |           130 |              1,158 |                  0 / 0 |
| Mixed           | 601.6875 px (default) | 1,189 |            69 |                432 |                  0 / 0 |
| Mixed           |                600 px | 1,189 |            69 |                434 |                  0 / 0 |
| Mixed           |                480 px | 1,189 |            80 |                448 |                  0 / 0 |
| Mixed           |              375.5 px | 1,189 |            95 |                464 |                  0 / 0 |

The mixed run initially found 96 fragment-position differences and seven overflowing pages across three widths. The code figure's margin rule was overriding the page-edge margin reset. The lab now trims those margins at both page edges, as the packer already did.

The default preserves the A4 template's fractional content width on Chromium's 1/64 px layout grid. At the old 601 px width, the oracle found line-start discrepancies in 52 text blocks, seven list paragraphs and one mixed paragraph. Two mixed page boundaries moved. Chromium's HTML and the worker's Canvas disagree about kerning around some spaces near a wrap threshold. The old width remains reproducible through the verification harness. Parity at the widths in the table does not guarantee parity at every width.

The unmodified full pagination stress document reports its unsupported content explicitly. That includes footnotes, page breaks, block quotes, and oversized code, list and table blocks. The lab uses one section with the base style profile and explicit geometry. It supports paragraph fragmentation with two-line widow and orphan limits. Lists, code and tables stay whole. Custom template scopes, captions, merged cells, loaded webfonts and numbering geometry remain outside the experiment. Results were verified in Chromium with the system fonts described below. Other layout engines and fonts still need coverage.

## Original benchmark

These timings are from the initial spike at the whole-pixel default width. Five paired runs per size, alternating which implementation ran first. Chromium 156.0.8078.79, Debian 13, AMD EPYC 9V74 with five available logical CPUs. System font matches for Arial and Courier New were Liberation Sans and Liberation Mono. Both paths completed font readiness before timing. Initial lab-bundle loading and common fixture generation are outside the measurements. Cold Pretext starts a fresh worker and parses the stored document in both contexts. Its total includes worker module startup, structured cloning, layout, and applying visible HTML. Warm changes the content width by 120 px in both paths. Pretext reuses its existing worker, source and prepared runs. The existing projection retains its editor and remeasures at the changed width. Production times include its measuring editor, page projection and DOM application.

Timings are milliseconds, median (minimum–maximum). The index is available on worker response or at the production layout callback. Paint uses the second animation frame after the first rendered page update, allowing an intervening paint. End waits for that paint and layout settlement. Long tasks are main-thread entries of at least 50 ms during the measured interval. DOM counts are mounted pages and descendant nodes, including the production measuring view for node counts.

| Document | Path     | Run          |                     Index |               First paint |                       End | Long tasks / total ms, median | Pages / DOM nodes |
| -------- | -------- | ------------ | ------------------------: | ------------------------: | ------------------------: | ----------------------------: | ----------------: |
| Short    | Existing | Cold         |            6.9 (5.2–26.1) |          33.5 (33.2–35.1) |          33.5 (33.2–35.1) |                         0 / 0 |           3 / 218 |
| Short    | Pretext  | Cold         |         65.1 (57.8–126.5) |         68.4 (66.5–144.2) |         68.4 (66.5–144.2) |                         0 / 0 |            2 / 71 |
| Short    | Existing | Width change |          34.8 (34.3–35.3) |          50.0 (49.9–50.2) |          66.6 (66.5–75.8) |                         0 / 0 |           4 / 223 |
| Short    | Pretext  | Width change |             1.2 (0.9–1.8) |          33.4 (33.2–34.9) |          33.4 (33.2–34.9) |                         0 / 0 |            2 / 67 |
| Medium   | Existing | Cold         |          23.2 (21.3–27.9) |          50.2 (49.9–67.0) |          50.2 (49.9–67.0) |                         0 / 0 |        24 / 1,651 |
| Medium   | Pretext  | Cold         |          74.4 (66.2–81.0) |          83.4 (83.2–85.2) |          83.4 (83.2–85.2) |                         0 / 0 |            2 / 71 |
| Medium   | Existing | Width change |          63.9 (55.4–78.1) |          66.6 (55.6–83.6) |         83.4 (66.7–100.1) |                         0 / 0 |        26 / 1,673 |
| Medium   | Pretext  | Width change |             4.7 (4.0–6.7) |          33.3 (32.3–41.8) |          33.3 (32.3–41.8) |                         0 / 0 |            2 / 67 |
| Long     | Existing | Cold         |       383.8 (327.6–548.9) |     742.9 (622.1–1,032.5) |     742.9 (622.1–1,032.5) |                       2 / 742 |      300 / 20,711 |
| Long     | Pretext  | Cold         |       143.0 (120.9–165.7) |       150.3 (133.2–172.8) |       150.3 (133.2–172.8) |                         0 / 0 |            2 / 71 |
| Long     | Existing | Width change | 1,116.8 (1,073.6–1,484.4) | 1,123.8 (1,075.2–1,486.5) | 1,131.0 (1,081.2–1,499.9) |                     3 / 1,117 |      320 / 20,971 |
| Long     | Pretext  | Width change |          22.1 (20.2–33.6) |          33.3 (33.2–73.7) |          33.3 (33.2–73.7) |                         0 / 0 |            2 / 67 |

The virtual index also had 3, 24, and 300 pages cold and 4, 26, and 320 after narrowing. A distant jump in the long document mounted three pages. The 300-page benchmark repeats 37 distinct heading and paragraph inputs across 4,800 blocks. Worker-only cold parse and line measurement took 67.2 ms median, with another 8.1 ms for packing and building the result. The 143.0 ms index includes the remaining startup, handoff and main-thread source preparation costs. On width change there were 4,800 preparation hits and zero misses, with 12.7 ms for line measurement and 5.9 ms for packing and result construction. The benchmark represents a text-heavy read-only viewer. It cannot separate the benefit of Canvas prediction from the benefit of mounting fewer pages.
