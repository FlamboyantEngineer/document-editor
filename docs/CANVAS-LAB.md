# Testing HTML-in-Canvas

From a checkout of `codex/html-in-canvas-lab`, run:

```sh
npm run labs
```

The command installs the pinned dependencies and builds the labs when necessary. Open
<http://127.0.0.1:4183/canvas.html>, or choose **HTML-in-Canvas** in the lab index.

## Browser and renderer

Use a browser with the stable HTML-in-Canvas API, such as Chrome 157 or later. The lab reports
**Native HTML-in-Canvas: available** when the required APIs exist. Its canvas page count confirms
that the editor actually selected Canvas. Unsupported browsers show **DOM fallback** and remain
editable. The development tests can enable the API on Chromium 156 with
`--enable-blink-features=CanvasDrawElement`.

The Renderer picker switches between DOM and HTML-in-Canvas while retaining the document's
edits and history. The Canvas option also requests the guarded plain paragraph measurement path;
rich content and paragraphs whose metrics fail validation still use DOM ranges.

## Things to try

1. **Edit and compare.** Type, select across paragraphs, paste, use the formatting toolbar and undo.
   Switch renderers and confirm the text and page breaks remain the same.
2. **Check fractional zoom.** Select 75%, 125% and 150% editor zoom. Diagnostics show the first
   allocated canvas's displayed CSS size and backing size. Backing dimensions follow the browser's
   exact device-pixel content box, including pixel snapping. They can differ by one pixel from
   `ceil(displayed CSS dimension × DPR)`; always rounding up can blur text. Also resize the window
   at 100% editor zoom and DPR 1: centered pages must stay sharp at both odd and even window widths.
3. **Change actual DPR.** Move the browser between displays, change browser zoom, or use DevTools
   device emulation at DPR 1, 1.25 and 2. The lab reports the browser's real `devicePixelRatio`;
   the editor zoom control is a separate setting.
4. **Exercise pagination.** Choose Long plain paragraphs, then Formatted and international text.
   The latter exercises DOM text measurement fallback while native Canvas can still paint pages.
   Show measuring view reveals the retained ghost document.
5. **Scroll many pages.** Choose Many pages and scroll through the document. The allocated bitmap
   count should stay below the total canvas page count once observers settle. Distant pages retain
   HTML but release their bitmaps.
6. **Compare text splitting.** Expand Text measurement comparison and run both lengths. It reports
   whether Canvas metrics qualified and whether the split offsets match. Timings include metric
   setup and split planning on an already laid-out paragraph; they exclude initial HTML layout and
   page painting. Keep the Reference stylesheet selected for its fixed geometry. Short samples may
   be slower with Canvas. Font differences can cause fallback.

Choosing another sample or Reset sample discards edits to the current sample. Renderer, sample
and zoom are reflected in the URL, for example:

<http://127.0.0.1:4183/canvas.html?rendering=html-canvas&scenario=long&zoom=125>

Canvas and DOM font antialiasing can still differ by browser and OS, especially on a 1× display.
Use DOM mode as the comparison for text quality. Matching the bitmap to physical pixels prevents
an extra resampling step; it does not promise identical font rasterization on every platform.

## Automated checks

```sh
npm run build:labs
CHROMIUM_PATH=/path/to/chromium npx playwright test e2e/canvas-lab.spec.ts e2e/canvas-rendering.spec.ts --project=chromium
```

Omit `CHROMIUM_PATH` when Playwright's browser is installed. The tests enable the native API where
the browser still requires its feature flag, and separately simulate its absence to verify fallback.
