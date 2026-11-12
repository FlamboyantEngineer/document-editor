#!/usr/bin/env node
// Bundles every labs/src/<name>.lab.ts(x) into labs/build/<name>.js (ESM with shared chunks), the
// lab chrome every page loads into labs/build/chrome.js, the settings each page applies from its
// head into labs/build/boot.js, and the Reference stylesheet labs/reference.css into
// labs/build/reference.css.
//   node scripts/build-labs.mjs [--dev] [--profile] [--watch]
// --profile keeps the production build readable, unminified with source maps, for a profiler.

import { rmSync } from 'node:fs';
import { join } from 'node:path';
import * as esbuild from 'esbuild';
import { labsDir, labSourceDir, listLabSources } from './lib/labs.mjs';
import { flag } from './lib/script.mjs';

const outdir = join(labsDir, 'build');
const dev = flag('dev');
const watch = flag('watch');
const profile = flag('profile');
const labs = listLabSources();

// The collaboration spike runs collaboration-tools' room server in the page; its server entry
// imports two Node built-ins, which resolve to small page versions.
const nodeShims = join(labSourceDir, 'spikes', 'node-shims.ts');
/** @type {import('esbuild').Plugin} */
const nodeBuiltinsInPage = {
  name: 'node-builtins-in-page',
  setup(build) {
    build.onResolve({ filter: /^node:(crypto|buffer)$/ }, () => ({ path: nodeShims }));
  },
};

rmSync(outdir, { recursive: true, force: true });

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: {
    // The base library's reference stylesheet, the document reference stylesheet and the lab layout.
    reference: join(labsDir, 'reference.css'),
    chrome: join(labSourceDir, 'chrome', 'mount.tsx'),
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
  plugins: [nodeBuiltinsInPage],
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
