#!/usr/bin/env node
// The cross-system Canvas width check (plan "Determinism"): measures a fixed reference text in
// served fonts with Canvas `measureText`, under each device pixel ratio and text rendering mode, and
// prints the widths with a fingerprint of each mode. Run it on each operating system and compare.
//   node canvas-widths.mjs <fonts-dir> [out.json]
// PROBE_CHANNEL=chromium measures in the full browser rather than the headless shell.
// <fonts-dir> holds geist-latin-wght-normal.woff2, KaTeX_Main-Regular.woff2 and
// KaTeX_SansSerif-Regular.woff2. CHROMIUM_PATH picks the browser; otherwise Playwright's own.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { platform, release } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

const [fontsDir = '.', out] = process.argv.slice(2);
const FONTS = [
  { family: 'Probe Geist', file: 'geist-latin-wght-normal.woff2', weights: [400, 700] },
  { family: 'Probe Serif', file: 'KaTeX_Main-Regular.woff2', weights: [400] },
  { family: 'Probe Sans', file: 'KaTeX_SansSerif-Regular.woff2', weights: [400] },
];
const SIZES = [11, 12, 13.333333, 16, 21.5];
const TEXTS = [
  'The quick brown fox jumps over the lazy dog.',
  'AVA FAA NASA To Ty Yo LT PA Wa',
  'Sphinx of black quartz, judge my vow; 0123456789 (1/64) — “quoted” text…',
  'Pagination splits paragraphs at line starts the engine computed beforehand',
  'iiiiiiiiii llllllllll mmmmmmmmmm WWWWWWWWWW',
  ' ',
  'fi fl ffi office affluent',
];
const WORDS = TEXTS.flatMap((text) => text.split(' ')).filter(Boolean);
const DPRS = [1, 1.25, 2];

function fontFaces() {
  return FONTS.map(({ family, file, weights }) => ({
    family,
    weights,
    data: readFileSync(join(fontsDir, file)).toString('base64'),
  }));
}

async function measure(dpr, faces) {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    channel: process.env.PROBE_CHANNEL || undefined,
    args: [`--force-device-scale-factor=${String(dpr)}`],
  });
  try {
    const page = await browser.newPage();
    await page.setContent('<!doctype html><html><body></body></html>');
    return await page.evaluate(
      async ({ faces, sizes, texts, words }) => {
        for (const { family, weights, data } of faces) {
          const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
          for (const weight of weights) {
            const face = new FontFace(family, bytes, { weight: String(weight) });
            document.fonts.add(await face.load());
          }
        }
        await document.fonts.ready;
        const canvas = new OffscreenCanvas(8, 8);
        const context = canvas.getContext('2d');
        if (!context) throw new Error('No 2D canvas');
        const span = document.createElement('span');
        span.style.whiteSpace = 'pre';
        document.body.append(span);
        const result = { devicePixelRatio: window.devicePixelRatio, canvas: {}, dom: {} };
        /** @type {CanvasTextRendering[]} */
        const renderings = ['auto', 'geometricPrecision', 'optimizeSpeed'];
        for (const rendering of renderings) {
          const widths = {};
          for (const { family, weights } of faces) {
            for (const weight of weights) {
              for (const size of sizes) {
                const font = `${String(weight)} ${String(size)}px "${family}"`;
                context.font = font;
                context.textRendering = rendering;
                for (const text of [...texts, ...words])
                  widths[`${font}|${text}`] = context.measureText(text).width;
              }
            }
          }
          result.canvas[rendering] = widths;
        }
        for (const rendering of ['auto', 'geometricPrecision']) {
          const widths = {};
          span.style.textRendering = rendering;
          for (const { family, weights } of faces) {
            for (const weight of weights) {
              for (const size of sizes) {
                span.style.font = `${String(weight)} ${String(size)}px "${family}"`;
                for (const text of texts) {
                  span.textContent = text;
                  widths[`${span.style.font}|${text}`] = span.getBoundingClientRect().width;
                }
              }
            }
          }
          result.dom[rendering] = widths;
        }
        // The same widths in a worker, where Pretext measures in the Pretext lab.
        const source = `onmessage = async ({ data: { faces, keys } }) => {
          for (const { family, weights, data } of faces) {
            const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
            for (const weight of weights) {
              const face = new FontFace(family, bytes, { weight: String(weight) });
              self.fonts.add(await face.load());
            }
          }
          const context = new OffscreenCanvas(8, 8).getContext('2d');
          const widths = {};
          for (const key of keys) {
            const [font, text] = key.split('|');
            context.font = font;
            widths[key] = context.measureText(text).width;
          }
          postMessage(widths);
        };`;
        const worker = new Worker(URL.createObjectURL(new Blob([source])));
        result.canvas.worker = await new Promise((resolve) => {
          worker.onmessage = ({ data }) => resolve(data);
          worker.postMessage({ faces, keys: Object.keys(result.canvas.auto) });
        });
        worker.terminate();
        return result;
      },
      { faces, sizes: SIZES, texts: TEXTS, words: WORDS },
    );
  } finally {
    await browser.close();
  }
}

const hash = (widths) =>
  createHash('sha256')
    .update(JSON.stringify(Object.entries(widths).sort(([a], [b]) => a.localeCompare(b))))
    .digest('hex')
    .slice(0, 16);

const faces = fontFaces();
const runs = [];
for (const dpr of DPRS) {
  const run = await measure(dpr, faces);
  runs.push({ dpr, ...run });
  for (const [kind, modes] of /** @type {[string, Record<string, object>][]} */ ([
    ['canvas', run.canvas],
    ['dom', run.dom],
  ])) {
    for (const [mode, widths] of Object.entries(modes)) {
      console.log(`${platform()} dpr=${String(dpr)} ${kind} ${mode} ${hash(widths)}`);
    }
  }
}
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  channel: process.env.PROBE_CHANNEL || undefined,
});
const version = browser.version();
await browser.close();
const report = { os: `${platform()} ${release()}`, chromium: version, runs };
if (out) writeFileSync(out, JSON.stringify(report));
console.log(`chromium ${version}`);
