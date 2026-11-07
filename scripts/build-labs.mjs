#!/usr/bin/env node
// Bundles every labs/src/<name>.lab.ts(x) into labs/build/<name>.js (ESM with shared chunks), and
// copies the base library's reference stylesheet to labs/build/ui-components.css.
//   node scripts/build-labs.mjs [--dev] [--watch]

import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { labsDir, listLabSources } from './lib/labs.mjs';
import { flag } from './lib/script.mjs';

const outdir = join(labsDir, 'build');
const dev = flag('dev');
const watch = flag('watch');
const labs = listLabSources();

rmSync(outdir, { recursive: true, force: true });
// The base library's reference stylesheet, which styles the controls labs show beside the document.
mkdirSync(outdir, { recursive: true });
copyFileSync(
  fileURLToPath(import.meta.resolve('@flamboyantengineer/ui-components/reference.css')),
  join(outdir, 'ui-components.css'),
);

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: Object.fromEntries(labs.map(({ name, file }) => [name, file])),
  outdir,
  bundle: true,
  splitting: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2022'],
  jsx: 'automatic',
  minify: !dev,
  sourcemap: dev ? 'linked' : false,
  chunkNames: 'chunks/[name]-[hash]',
  define: { 'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production') },
  legalComments: 'none',
  logLevel: 'info',
};

if (watch) {
  const context = await esbuild.context(options);
  await context.watch();
  console.log(`Watching ${String(labs.length)} labs.`);
} else {
  await esbuild.build(options);
  console.log(`Built ${String(labs.length)} labs into labs/build/.`);
}
