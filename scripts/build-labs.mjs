#!/usr/bin/env node
// Bundles every labs/src/<name>.lab.ts(x) into labs/build/<name>.js (ESM with shared chunks), the
// lab chrome every page loads into labs/build/chrome.js, the settings each page applies from its
// head into labs/build/boot.js, and the Reference stylesheet labs/reference.css into
// labs/build/reference.css. The fonts the Pretext labs serve, and HarfBuzz's wasm for font-file
// widths (DOCE-LABS-7), are copied into labs/build/fonts/.
//   node scripts/build-labs.mjs [--dev] [--profile] [--watch]
// --profile keeps the production build readable, unminified with source maps, for a profiler.

import { copyFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { flag } from '@flamboyantengineer/ui-components/tooling/lib/script.mjs';
import * as esbuild from 'esbuild';
import { labsDir, labSourceDir, listLabSources } from './lib/labs.mjs';

const outdir = join(labsDir, 'build');
const dev = flag('dev');
const watch = flag('watch');
const profile = flag('profile');
const labs = listLabSources();

rmSync(outdir, { recursive: true, force: true });

// Geist and Geist Mono (Latin, WOFF), four KaTeX faces and HarfBuzz, as files the labs fetch.
const require = createRequire(import.meta.url);
const fontsDir = join(outdir, 'fonts');
mkdirSync(fontsDir, { recursive: true });
const served = (file) => /-latin-(400|700)-(normal|italic)\.woff$/u.test(file);
for (const name of ['@fontsource/geist', '@fontsource/geist-mono']) {
  const files = join(dirname(require.resolve(`${name}/package.json`)), 'files');
  for (const file of readdirSync(files).filter(served))
    copyFileSync(join(files, file), join(fontsDir, file));
}
const katexFonts = join(dirname(require.resolve('katex/package.json')), 'dist', 'fonts');
for (const face of ['Main-Regular', 'Main-Bold', 'Main-Italic', 'SansSerif-Regular'])
  copyFileSync(join(katexFonts, `KaTeX_${face}.woff`), join(fontsDir, `KaTeX_${face}.woff`));
const harfBuzz = join(dirname(require.resolve('harfbuzzjs')), 'harfbuzz.wasm');
copyFileSync(harfBuzz, join(fontsDir, 'harfbuzz.wasm'));

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: {
    // The base library's reference stylesheet, the document reference stylesheet and the lab layout.
    reference: join(labsDir, 'reference.css'),
    // The same on the base library's shadcn/ui stylesheet, with the editor's shadcn/ui retouch.
    shadcn: join(labsDir, 'shadcn.css'),
    chrome: join(labSourceDir, 'chrome', 'mount.tsx'),
    'pretext-pagination-worker': join(labSourceDir, 'spikes', 'pretext', 'worker.ts'),
    ...Object.fromEntries(labs.map(({ name, file }) => [name, file])),
  },
  outdir,
  bundle: true,
  splitting: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2022'],
  jsx: 'automatic',
  minify: !dev && !profile,
  sourcemap: dev || profile ? 'linked' : false,
  chunkNames: 'chunks/[name]-[hash]',
  define: { 'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production') },
  legalComments: 'none',
  logLevel: 'info',
};

// The settings every page applies from its head before the body is parsed: a classic script, since
// the head cannot wait for a module, so the first paint already has the stylesheet and theme.
/** @type {import('esbuild').BuildOptions} */
const bootOptions = {
  ...options,
  entryPoints: { boot: join(labSourceDir, 'chrome', 'boot.ts') },
  splitting: false,
  format: 'iife',
};

const builds = [options, bootOptions];

if (watch) {
  const contexts = await Promise.all(builds.map((build) => esbuild.context(build)));
  await Promise.all(contexts.map((context) => context.watch()));
  console.log(`Watching ${String(labs.length)} labs.`);
} else {
  await Promise.all(builds.map((build) => esbuild.build(build)));
  console.log(`Built ${String(labs.length)} labs into labs/build/.`);
}
