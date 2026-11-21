// The font-file widths spike (Pretext plan, thread S): the reference text measured from the served
// font files with HarfBuzz and with this browser's Canvas, compared string by string, with the
// fingerprints of both and of Pretext's line breaks through each. `window.fontWidths` holds the
// result for the browser tests.

import { fingerprintLines, type LineFingerprint } from './spikes/font-widths/line-fingerprint.js';
import { createFontFileMeasurer } from './spikes/font-widths/measurer.js';
import {
  fingerprintWidths,
  measureReference,
  REFERENCE_FACES,
} from './spikes/font-widths/reference.js';
import { requireValue } from './spikes/pretext/fixtures.js';

export interface FontWidthsResult {
  readonly fingerprints: { readonly fontFiles: string; readonly canvas: string };
  readonly lines: { readonly fontFiles: LineFingerprint; readonly canvas: LineFingerprint };
  /** Strings whose font-file width is not Canvas's, with both widths. */
  readonly differences: readonly { key: string; fontFiles: number; canvas: number }[];
  readonly strings: number;
  /** Characters of the reference text no served face has. */
  readonly missingGlyphs: readonly string[];
  readonly loadMs: number;
}

declare global {
  interface Window {
    fontWidths: Promise<FontWidthsResult>;
  }
}

const mount = (selector: string) => requireValue(document.querySelector(selector), selector);

async function bytesOf(path: string) {
  const response = await fetch(new URL(path, document.baseURI));
  if (!response.ok) throw new Error(`Cannot load ${path}`);
  return response.arrayBuffer();
}

function geometricContext() {
  const context = requireValue(new OffscreenCanvas(1, 1).getContext('2d'), 'Canvas 2D');
  context.textRendering = 'geometricPrecision';
  return context;
}

function row(cells: readonly string[], header = false) {
  const tr = document.createElement('tr');
  for (const text of cells) {
    const cell = document.createElement(header ? 'th' : 'td');
    cell.textContent = text;
    tr.append(cell);
  }
  return tr;
}

const fontOf = (key: string) => (key.split('|')[0] ?? '').replace(/ [\d.]+px /u, ' ');

async function measure(): Promise<FontWidthsResult> {
  const started = performance.now();
  const [wasm, faces] = await Promise.all([
    bytesOf('build/fonts/harfbuzz.wasm'),
    Promise.all(
      REFERENCE_FACES.map(async ({ file, ...face }) => ({
        ...face,
        bytes: await bytesOf(`build/fonts/${file}`),
      })),
    ),
  ]);
  const measurer = await createFontFileMeasurer({ wasm, faces });
  const loadMs = performance.now() - started;
  for (const { family, weight, italic, bytes } of faces) {
    const face = new FontFace(family, bytes, {
      weight: String(weight),
      style: italic ? 'italic' : 'normal',
    });
    document.fonts.add(await face.load());
  }
  const fontFiles = measureReference(measurer.createContext());
  const canvas = measureReference(geometricContext());
  // Before Pretext's own probes, which ask about characters the reference text does not hold.
  const missing = [...measurer.problems.missingGlyphs];
  const differences = Object.entries(fontFiles)
    .filter(([key, width]) => canvas[key] !== width)
    .map(([key, width]) => ({ key, fontFiles: width, canvas: canvas[key] ?? Number.NaN }));
  return {
    fingerprints: { fontFiles: fingerprintWidths(fontFiles), canvas: fingerprintWidths(canvas) },
    lines: {
      fontFiles: fingerprintLines(
        () => measurer.createContext() as unknown as OffscreenCanvasRenderingContext2D,
      ),
      canvas: fingerprintLines(geometricContext),
    },
    differences,
    strings: Object.keys(fontFiles).length,
    missingGlyphs: missing.map((code) => `U+${code.toString(16).toUpperCase().padStart(4, '0')}`),
    loadMs,
  };
}

function show(result: FontWidthsResult) {
  const prints = mount('#fw-fingerprints');
  prints.append(row(['Measure', 'Widths', 'Pretext lines', 'Prepare (120 paragraphs)'], true));
  for (const name of ['fontFiles', 'canvas'] as const) {
    const lines = result.lines[name];
    prints.append(
      row([
        name === 'fontFiles' ? 'Font files (HarfBuzz)' : 'Canvas (this machine)',
        result.fingerprints[name],
        `${lines.fingerprint} (${String(lines.lines)} lines)`,
        `${lines.prepareMs.toFixed(1)} ms`,
      ]),
    );
  }
  const faces = mount('#fw-faces');
  faces.append(row(['Face', 'Identical', 'Largest difference'], true));
  const fonts = [
    ...new Set(
      REFERENCE_FACES.map(
        ({ family, weight, italic }) => `${italic ? 'italic ' : ''}${String(weight)} "${family}"`,
      ),
    ),
  ];
  const perFace = result.strings / fonts.length;
  for (const font of fonts) {
    const own = result.differences.filter(({ key }) => fontOf(key) === font);
    const most = Math.max(0, ...own.map(({ fontFiles, canvas }) => Math.abs(fontFiles - canvas)));
    faces.append(
      row([font, `${String(perFace - own.length)} of ${String(perFace)}`, `${most.toFixed(6)} px`]),
    );
  }
  const list = mount('#fw-differences');
  list.append(row(['String', 'Font files', 'Canvas', 'Difference'], true));
  for (const { key, fontFiles, canvas } of result.differences)
    list.append(
      row([key, fontFiles.toFixed(6), canvas.toFixed(6), (canvas - fontFiles).toFixed(6)]),
    );
  const missing = result.missingGlyphs.length
    ? ` No served face has ${result.missingGlyphs.join(', ')}; Canvas draws it from a system font.`
    : '';
  mount('#fw-status').textContent =
    `${String(result.strings - result.differences.length)} of ${String(result.strings)} widths identical to Canvas; HarfBuzz and the faces loaded in ${result.loadMs.toFixed(0)} ms.${missing}`;
  document.documentElement.dataset.labReady = 'true';
}

window.fontWidths = measure();
window.fontWidths.then(show).catch((error: unknown) => {
  mount('#fw-status').textContent = error instanceof Error ? error.message : String(error);
});
