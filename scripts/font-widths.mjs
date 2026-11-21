#!/usr/bin/env node
// The font-file width check (font-widths spike, DOCE-LABS-7): measures the reference text with the
// HarfBuzz font-file measurer in Node, in a Chromium page and in a worker, beside Canvas
// `measureText` under geometricPrecision, and prints a fingerprint of each. Run it on each
// operating system and compare the JSON files with scripts/font-widths-compare.mjs.
//   node scripts/font-widths.mjs [out.json]
// CHROMIUM_PATH picks the browser; otherwise Playwright's own.

import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { platform, release } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const [out] = process.argv.slice(2);

const fontDirs = [
  join(dirname(require.resolve('@fontsource/geist/package.json')), 'files'),
  join(dirname(require.resolve('@fontsource/geist-mono/package.json')), 'files'),
  join(dirname(require.resolve('katex/package.json')), 'dist', 'fonts'),
];
const wasmPath = join(dirname(require.resolve('harfbuzzjs')), 'harfbuzz.wasm');

function read(file) {
  for (const dir of fontDirs) {
    try {
      return readFileSync(join(dir, file));
    } catch {
      // Not in this directory.
    }
  }
  throw new Error(`No served font ${file}`);
}

// The probe: the measurer and the reference text, bundled into one script for page and worker.
const entry = `
import { createFontFileMeasurer } from './labs/src/spikes/font-widths/measurer.ts';
import { REFERENCE_FACES, fingerprintWidths, measureReference } from './labs/src/spikes/font-widths/reference.ts';
globalThis.fontWidthsProbe = async ({ wasm, faces }) => {
  const started = performance.now();
  const measurer = await createFontFileMeasurer({ wasm, faces });
  const loadMs = performance.now() - started;
  const fontFiles = measureReference(measurer.createContext());
  const measureMs = performance.now() - started - loadMs;
  let canvas = null;
  if (typeof OffscreenCanvas !== 'undefined') {
    for (const face of faces) {
      const font = new FontFace(face.family, face.bytes, { weight: String(face.weight), style: face.italic ? 'italic' : 'normal' });
      (globalThis.document?.fonts ?? globalThis.fonts).add(await font.load());
    }
    const context = new OffscreenCanvas(8, 8).getContext('2d');
    context.textRendering = 'geometricPrecision';
    canvas = measureReference(context);
  }
  return {
    fontFiles, canvas, loadMs, measureMs, heapBytes: measurer.heapBytes(),
    problems: { missingGlyphs: [...measurer.problems.missingGlyphs], unservedFonts: [...measurer.problems.unservedFonts] },
    fingerprints: { fontFiles: fingerprintWidths(fontFiles), canvas: canvas && fingerprintWidths(canvas) },
  };
};
export const faces = REFERENCE_FACES;
`;
const bundle = await esbuild.build({
  stdin: { contents: entry, resolveDir: root, loader: 'ts' },
  bundle: true,
  write: false,
  format: 'esm',
  target: 'es2022',
});
const code = bundle.outputFiles[0]?.text ?? '';
const module = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const wasm = readFileSync(wasmPath);
const faces = module.faces.map((face) => ({ ...face, bytes: read(face.file) }));

const node = await globalThis.fontWidthsProbe({ wasm, faces });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const version = browser.version();
const page = await browser.newPage();
await page.setContent('<!doctype html><html><body></body></html>');
const script = code.replace(/export\s*\{[^}]*\};?\s*$/u, '');
const payload = {
  script,
  wasm: wasm.toString('base64'),
  faces: faces.map((face) => ({ ...face, bytes: face.bytes.toString('base64') })),
};
const inBrowser = await page.evaluate(async ({ script, wasm, faces }) => {
  const bytes = (data) => Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  const input = () => ({ wasm: bytes(wasm), faces: faces.map((f) => ({ ...f, bytes: bytes(f.bytes) })) });
  new Function(script)();
  const page = await globalThis.fontWidthsProbe(input());
  const source = `${script}\nonmessage = async ({ data }) => postMessage(await globalThis.fontWidthsProbe(data));`;
  const worker = new Worker(URL.createObjectURL(new Blob([source])));
  const inWorker = await new Promise((resolve, reject) => {
    worker.onmessage = ({ data }) => resolve(data);
    worker.onerror = (event) => reject(new Error(event.message));
    worker.postMessage(input());
  });
  worker.terminate();
  return { page, worker: inWorker };
}, payload);
await browser.close();

const report = { os: `${platform()} ${release()}`, chromium: version, node, ...inBrowser };
for (const [where, run] of Object.entries({ node, page: inBrowser.page, worker: inBrowser.worker })) {
  console.log(
    `${platform()} ${where} font-files ${run.fingerprints.fontFiles} canvas ${String(run.fingerprints.canvas)} load ${run.loadMs.toFixed(1)} ms measure ${run.measureMs.toFixed(1)} ms`,
  );
}
if (out) writeFileSync(out, JSON.stringify(report));
console.log(`chromium ${version}`);
