# Pretext pagination spike

**Recommendation.** Extend the experiment. The 300-page text workload painted its first page about five times faster and mounted two of 300 pages. Cold startup was slower on both smaller documents. Mixed inline font metrics still disagree with HTML, and the benchmark uses many repeated paragraphs. Measure a less repetitive corpus and address the line-box differences before considering production use.

## Run it

Start the lab with `npm run labs` and open [Pretext pagination](http://127.0.0.1:4183/pretext-pagination.html). Choose Long document, enter page 271, and select **Go to page**. The default overscan is one page on each side. **Check HTML parity** on the formatting examples displays line, height, page boundary, and overflow differences. Use the Reference stylesheet for the experiment's sizing rules.

```sh
npm run build:labs
CHROMIUM_PATH=/usr/bin/chromium npx playwright test e2e/pretext-pagination.spec.ts --project=chromium --workers=1
PRETEXT_BENCH=1 CHROMIUM_PATH=/usr/bin/chromium npx playwright test e2e/pretext-pagination.performance.spec.ts --project=performance --no-deps --workers=1 --reporter=json > /tmp/pretext-benchmark.json
```

Omit `CHROMIUM_PATH` when using Playwright's installed browser. The file from the last command includes the raw samples as a JSON attachment.

## Prediction and HTML parity

The lab reads stored fixtures through the editor schema and resolves the base template's typography and page metrics. The worker takes a stored document and returns page dimensions and ordered ranges in original block coordinates. The viewer serializes only fragments in the viewport window. Source ranges use ProseMirror offsets, including inline atoms. Rendering cuts source content at page boundaries and allows the HTML on each page to wrap naturally.

The pinned `@chenglou/pretext@1.0.0` exposes `prepareRichInline`, `walkRichInlineLineRanges`, and `materializeRichInlineLineRange` through `@chenglou/pretext/rich-inline`. The materialized fragments report item-local UTF-16 offsets and the API accepts fixed-width boxes. It provides line advances. The adapter supplies explicit line-box heights and all vertical geometry. The package can insert an emoji calibration span and read its DOM geometry in a document. A dedicated worker prevents this probe and uses Canvas from `OffscreenCanvas`. The worker retains preparation by text, font and whitespace policy across widths. The lab waits for font readiness and restarts prediction on subsequent load or error events. The scope uses system fonts and needs no worker font registration.

The oracle serializes the original blocks into a separate column with the same reference rules and natural browser wrapping. It uses browser box heights and per-grapheme ranges to compare line counts and source starts. It then feeds browser dimensions to the shared page packer. It also checks the virtual pages for rendered overflow and compares a three-page text fixture directly with the production projection's boundaries. The oracle's geometry reads run only on explicit verification. There is no explicit-line rendering mode.

| Content width | Boxes compared | Line count and start differences | Height differences       | Predicted / HTML pages | Boundary differences / overflow pages |
| ------------: | -------------: | -------------------------------: | ------------------------ | ---------------------: | ------------------------------------: |
|        600 px |             64 |                                0 | 2, +1 px / +5 px in HTML |                  4 / 4 |                                 0 / 0 |
|        510 px |             64 |                                0 | 2, +1 px / +6 px in HTML |                  4 / 4 |                                 0 / 0 |
|        375 px |             64 |                                0 | 2, +1 px / +8 px in HTML |                  5 / 5 |                                 0 / 0 |

Height comparisons use 0.5 px and source offsets compare exactly. Both height failures involve italic inline code alongside proportional text. Chromium expands those line boxes to 19 px where the adapter predicts 18 px. The extra pixels did not move boundaries in these fixtures. The stored document serializes identically before and after the spike runs.

The checked subset covers paragraphs, headings, bold and italic, links and inline code, long words, collapsed whitespace and hard breaks, CJK, Arabic and emoji, nested bullet and ordered lists, pre-wrapped code, fixed-size images, simple fixed-width tables, and fixed-size inline and display math. Table rows take the tallest cell height. Math boxes display source as a placeholder with fixed geometry.

The lab uses one section with the base style profile, explicit pixel line heights, and a lab-scoped reference layout. It reports unsupported nodes, marks, style overrides, and oversized indivisible blocks. Captions, floated or fluid images, host assets, footnotes, custom headers and footers, merged cells, tasks, custom template scopes, numbering geometry, and loaded webfonts are outside the scope. Paragraphs can fragment across pages with two-line widow and orphan limits. Lists, code blocks, and tables stay whole. Editor-specific line-box expansion, hyphenation, font and emoji fallback, and cross-browser shaping need coverage before adoption.

## Benchmark

Five paired runs per size, alternating which implementation ran first. Chromium 156.0.8078.79, Debian 13, AMD EPYC 9V74 with five available logical CPUs. System font matches for Arial and Courier New were Liberation Sans and Liberation Mono. Both paths completed font readiness before timing. Initial lab-bundle loading and common fixture generation are outside the measurements. Cold Pretext starts a fresh worker and parses the stored document in both contexts. Its total includes worker module startup, structured cloning, layout, and applying visible HTML. Warm changes the content width by 120 px in both paths. Pretext reuses its existing worker, source and prepared runs. The existing projection retains its editor and remeasures at the changed width. Production times include its measuring editor, page projection and DOM application.

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
