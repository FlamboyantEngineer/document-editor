#!/usr/bin/env node
// Coverage of the font-file measurer (font-widths spike, DOCE-LABS-7): CJK, Arabic, Hebrew,
// Devanagari, mixed directions, fallback through the family list, missing glyphs, letter
// spacing, tabs, kerning off and invisible characters. Each case is measured with the font-file
// measurer, with Canvas under geometricPrecision, and as a DOM span under geometricPrecision and
// under the default rendering, in the headless shell and in the full browser.
//   node scripts/font-widths-coverage.mjs [out.json]
// The CJK, Arabic, Hebrew and Devanagari fonts are not dependencies of this repository: install
// them first without saving (`npm install --no-save @fontsource/noto-sans-jp@5.3.1
// @fontsource/noto-sans-arabic@5.3.0 @fontsource/noto-sans-hebrew@5.3.0
// @fontsource/noto-sans-devanagari@5.3.0`). CHROMIUM_PATH and HEADLESS_SHELL_PATH pick the
// browsers; otherwise Playwright's own (the headless shell, and the `chromium` channel).

import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { platform } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const [out] = process.argv.slice(2);
const packageDir = (name) => dirname(require.resolve(`${name}/package.json`));

const CJK_TEXT =
  '日本語の文章を組版するときは行末の処理が大切です。漢字かな交じり文、「かぎ括弧」とパジネーションの例文です';

// The faces each case may draw from, read with their unicode-range from the package's CSS.
function fontsourceFaces(name, family, scripts) {
  const dir = packageDir(name);
  const css = readFileSync(join(dir, '400.css'), 'utf8');
  const rules = [
    ...css.matchAll(/src: url\(\.\/files\/([^)]+)\.woff2\)[^}]*?unicode-range: ([^;]+);/gu),
  ];
  return rules
    .filter(([, file = '']) => scripts.some((script) => file.includes(`-${script}-400-normal`)))
    .map(([, file, unicodeRange]) => ({
      family,
      weight: 400,
      italic: false,
      unicodeRange,
      bytes: readFileSync(join(dir, 'files', `${file}.woff`)),
    }));
}
function cjkChunks() {
  const dir = packageDir('@fontsource/noto-sans-jp');
  const css = readFileSync(join(dir, '400.css'), 'utf8');
  const rules = [
    ...css.matchAll(
      /src: url\(\.\/files\/(noto-sans-jp-\d+-400-normal)\.woff2\)[^}]*?unicode-range: ([^;]+);/gu,
    ),
  ];
  const inRange = (code, range) =>
    range.split(',').some((part) => {
      const [low, high = low] = part.trim().slice(2).split('-');
      return code >= Number.parseInt(low, 16) && code <= Number.parseInt(high, 16);
    });
  const text = `${CJK_TEXT}改ページ`;
  return rules
    .filter(([, , range]) => [...text].some((c) => inRange(c.codePointAt(0), range)))
    .map(([, file, unicodeRange]) => ({
      family: 'Lab Noto JP',
      weight: 400,
      italic: false,
      unicodeRange,
      bytes: readFileSync(join(dir, 'files', `${file}.woff`)),
    }));
}
const geist = (file, weight) => ({
  family: 'Lab Geist',
  weight,
  italic: false,
  bytes: readFileSync(join(packageDir('@fontsource/geist'), 'files', file)),
});
const faces = [
  geist('geist-latin-400-normal.woff', 400),
  ...cjkChunks(),
  ...fontsourceFaces('@fontsource/noto-sans-arabic', 'Lab Noto Arabic', ['arabic', 'latin']),
  ...fontsourceFaces('@fontsource/noto-sans-hebrew', 'Lab Noto Hebrew', ['hebrew', 'latin']),
  ...fontsourceFaces('@fontsource/noto-sans-devanagari', 'Lab Noto Devanagari', [
    'devanagari',
    'latin',
  ]),
  {
    family: 'Lab KaTeX Math',
    weight: 400,
    italic: true,
    bytes: readFileSync(join(packageDir('katex'), 'dist', 'fonts', 'KaTeX_Math-Italic.woff')),
  },
];

const cases = [
  { name: 'CJK, 50 characters', font: '16px "Lab Noto JP"', text: CJK_TEXT.slice(0, 50) },
  { name: 'CJK words', font: '16px "Lab Noto JP"', text: '組版 改ページ 「例」' },
  {
    name: 'Latin then CJK fallback',
    font: '16px "Lab Geist", "Lab Noto JP"',
    text: 'Pagination 改ページ test',
  },
  { name: 'Arabic', font: '16px "Lab Noto Arabic"', text: 'مرحبا بالعالم، هذا نص تجريبي' },
  { name: 'Hebrew', font: '16px "Lab Noto Hebrew"', text: 'שלום עולם, זה טקסט לדוגמה' },
  {
    name: 'Mixed directions',
    font: '16px "Lab Geist", "Lab Noto Arabic"',
    text: 'The word مرحبا means hello (123).',
  },
  {
    name: 'Devanagari',
    font: '16px "Lab Noto Devanagari"',
    text: 'नमस्ते दुनिया, यह एक परीक्षण है',
  },
  { name: 'Missing glyphs', font: '16px "Lab Geist"', text: 'snow ☃ and 😀' },
  {
    name: 'Letter spacing 0.5px',
    font: '16px "Lab Geist"',
    text: 'office affluent fjord',
    letterSpacing: '0.5px',
  },
  {
    name: 'Letter spacing 1.25px',
    font: '16px "Lab Geist"',
    text: 'The quick brown fox',
    letterSpacing: '1.25px',
  },
  { name: 'Tabs', font: '16px "Lab Geist"', text: 'a\tb\tc' },
  { name: 'Kerning off', font: '16px "Lab Geist"', text: 'AVA To Ty Wa', kerning: 'none' },
  {
    name: 'Invisible characters',
    font: '16px "Lab Geist"',
    text: 'non breaking zero​width soft­hyphen',
  },
  { name: 'Math italic', font: 'italic 16px "Lab KaTeX Math"', text: 'f(x) = ax + by' },
  {
    name: 'Fractional size 14.666667px',
    font: '14.666667px "Lab Geist"',
    text: 'The weather station on the ridge',
  },
];

const entry = `
import { createFontFileMeasurer } from './labs/src/spikes/font-widths/measurer.ts';
globalThis.fontWidthsCoverage = async ({ wasm, faces, cases }) => {
  const measurer = await createFontFileMeasurer({ wasm, faces });
  const context = measurer.createContext();
  context.lang = 'en';
  const widths = cases.map(({ font, text, letterSpacing = '0px', kerning = 'auto' }) => {
    context.font = font; context.letterSpacing = letterSpacing; context.fontKerning = kerning;
    return context.measureText(text).width;
  });
  return { widths, problems: { missingGlyphs: [...measurer.problems.missingGlyphs].map((c) => c.toString(16)), unservedFonts: [...measurer.problems.unservedFonts] } };
};
`;
const bundle = await esbuild.build({
  stdin: { contents: entry, resolveDir: root, loader: 'ts' },
  bundle: true,
  write: false,
  format: 'iife',
  target: 'es2022',
});
const script = bundle.outputFiles[0]?.text ?? '';
const wasm = readFileSync(join(dirname(require.resolve('harfbuzzjs')), 'harfbuzz.wasm'));
new Function(script)();
const fontFiles = await globalThis.fontWidthsCoverage({ wasm, faces, cases });

async function browserWidths(launch) {
  const browser = await chromium.launch(launch);
  try {
    const page = await browser.newPage();
    await page.setContent('<!doctype html><html lang="en"><body></body></html>');
    const result = await page.evaluate(
      async ({ faces, cases }) => {
        for (const { family, weight, italic, bytes, ...rest } of faces) {
          const unicodeRange = 'unicodeRange' in rest ? rest.unicodeRange : undefined;
          const face = new FontFace(
            family,
            Uint8Array.from(atob(bytes), (c) => c.charCodeAt(0)),
            {
              weight: String(weight),
              style: italic ? 'italic' : 'normal',
              ...(unicodeRange ? { unicodeRange } : {}),
            },
          );
          document.fonts.add(face);
        }
        const context = new OffscreenCanvas(8, 8).getContext('2d');
        if (!context) throw new Error('No Canvas 2D');
        context.textRendering = 'geometricPrecision';
        const span = document.createElement('span');
        span.style.whiteSpace = 'nowrap';
        document.body.append(span);
        const dom = (rendering) =>
          cases.map(({ font, text, letterSpacing = '0px', kerning = 'auto' }) => {
            span.style.font = font;
            span.style.letterSpacing = letterSpacing;
            span.style.fontKerning = kerning;
            span.style.textRendering = rendering;
            span.textContent = text;
            return span.getBoundingClientRect().width;
          });
        // Load every face the cases use before measuring.
        for (const { font, text } of cases) await document.fonts.load(font, text);
        await document.fonts.ready;
        const canvas = cases.map(({ font, text, letterSpacing = '0px', kerning = 'auto' }) => {
          context.font = font;
          context.letterSpacing = letterSpacing;
          context.fontKerning = /** @type {CanvasFontKerning} */ (kerning);
          return context.measureText(text).width;
        });
        return { canvas, domPrecise: dom('geometricPrecision'), domAuto: dom('auto') };
      },
      { faces: faces.map((face) => ({ ...face, bytes: face.bytes.toString('base64') })), cases },
    );
    return { version: browser.version(), ...result };
  } finally {
    await browser.close();
  }
}

const shell = await browserWidths({ executablePath: process.env.HEADLESS_SHELL_PATH || undefined });
const full = await browserWidths(
  process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : { channel: 'chromium' },
);
const rows = cases.map(({ name }, index) => ({
  name,
  fontFiles: fontFiles.widths[index],
  shell: {
    canvas: shell.canvas[index],
    domPrecise: shell.domPrecise[index],
    domAuto: shell.domAuto[index],
  },
  full: {
    canvas: full.canvas[index],
    domPrecise: full.domPrecise[index],
    domAuto: full.domAuto[index],
  },
}));
const report = {
  os: platform(),
  shell: shell.version,
  full: full.version,
  problems: fontFiles.problems,
  rows,
};
for (const { name, fontFiles: widths, shell: s, full: f } of rows) {
  const d = (value) => (value - widths).toFixed(4).padStart(9);
  console.log(
    `${name.padEnd(30)} ${widths.toFixed(4).padStart(10)}  shell canvas ${d(s.canvas)} dom ${d(s.domPrecise)} ${d(s.domAuto)}  full canvas ${d(f.canvas)} dom ${d(f.domPrecise)} ${d(f.domAuto)}`,
  );
}
console.log(JSON.stringify(report.problems));
if (out) writeFileSync(out, JSON.stringify(report, null, 2));
