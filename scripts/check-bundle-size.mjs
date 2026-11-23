#!/usr/bin/env node
// Bundles a small matrix of consumers of the built entry under production webpack and checks each against
// its budget in `scripts/bundle-budgets.json` (DOCE-ENTRY-2): the initial code's raw and gzipped
// size, which modules must load on first use rather than with the entry, and which a consumer must
// still hold somewhere, so a broken measurement fails. React stays external, as a host provides it.
//   node scripts/check-bundle-size.mjs [--update]
// `--update` writes the measured sizes as the new baselines.

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { flag, reportProblems } from '@flamboyantengineer/ui-components/tooling/lib/script.mjs';
import TerserPlugin from 'terser-webpack-plugin';
import webpackModule from 'webpack';
import {
  chunksOf,
  compareBudgets,
  matchingModules,
  measureFiles,
  updatedBudgets,
} from './lib/bundle-budgets.mjs';
import { root } from './lib/labs.mjs';

const BUDGETS = join(root, 'scripts/bundle-budgets.json');
const ENTRY = JSON.stringify(join(root, 'dist/index.js'));
const UI = 'ui-components/dist/components';
const EXTERNALS = {
  react: 'React',
  'react-dom': 'ReactDOM',
  'react-dom/client': 'ReactDOMClient',
  'react/jsx-runtime': 'ReactJSXRuntime',
};
const { webpack } = webpackModule;

// What the editor loads the first time a writer opens it, never with the entry (DOCE-ENTRY-2.2).
const ON_FIRST_USE = [
  'dist/components/document-editor/(figure|reference|abbreviation|script|linked-code)-dialog\\.js',
  `${UI}/(asset-picker|file-upload|character-grid)/`,
  'node_modules/katex/',
  'node_modules/@y/',
  `${UI}/emoji-picker/data/`,
];

const use = (/** @type {string[]} */ names) => `import { ${names.join(', ')} } from ${ENTRY};
globalThis.used = [${names.join(', ')}];`;

const CONSUMERS = [
  {
    name: 'editor',
    entry: use(['DocumentEditor']),
    lazy: ON_FIRST_USE,
    holds: ['dist/components/document-editor/figure-dialog\\.js', 'node_modules/katex/'],
  },
  {
    name: 'editor-with-panels',
    entry: use(['DocumentEditor', 'DocumentSidePanel', 'DocumentCommentsPanel']),
    lazy: ON_FIRST_USE,
    holds: ['dist/components/document-panels/document-side-panel\\.js'],
  },
  {
    name: 'template-workspace',
    entry: use(['TemplateWorkspace']),
    // What the workspace loads the first time it shows (DOCE-ENTRY-2.5).
    lazy: [
      `${UI}/code-editor/`,
      'dist/components/template-workspace/template-open-list\\.js',
      'dist/components/template-workspace/template-preview-editor\\.js',
      'dist/components/document-editor/document-editor\\.js',
    ],
    holds: ['dist/components/template-workspace/template-workspace\\.js'],
  },
];

/**
 * Bundles one consumer under production webpack, as a host's build would, and returns its initial
 * code's sizes and the modules of its initial and of all its chunks.
 * @param {string} workDir
 * @param {{ name: string, entry: string }} consumer
 */
async function bundle(workDir, { name, entry }) {
  writeFileSync(join(workDir, `${name}.js`), entry);
  const output = join(workDir, name);
  const compiler = webpack({
    mode: 'production',
    context: workDir,
    entry: `./${name}.js`,
    output: { path: output, filename: 'bundle.js', chunkFilename: '[id].chunk.js' },
    cache: false,
    devtool: false,
    externals: EXTERNALS,
    resolve: { modules: [join(root, 'node_modules')] },
    performance: { hints: false },
    // Run the production minifier in this worker rather than spawning unbounded workers.
    optimization: { minimizer: [new TerserPlugin({ parallel: false })] },
  });
  if (!compiler) throw new Error('Webpack did not create a compiler');
  try {
    /** @type {import('webpack').Stats} */
    const stats = await new Promise((resolve, reject) => {
      compiler.run((error, result) => {
        if (error) reject(error);
        else if (!result || result.hasErrors()) {
          reject(new Error(result?.toString({ all: false, errors: true }) ?? 'No webpack result'));
        } else resolve(result);
      });
    });
    const chunks = chunksOf(stats.compilation);
    const initial = chunks.filter((chunk) => chunk.initial);
    return {
      sizes: measureFiles(
        initial.flatMap((chunk) => chunk.files.map((file) => readFileSync(join(output, file)))),
      ),
      initialModules: initial.flatMap((chunk) => chunk.modules),
      allModules: chunks.flatMap((chunk) => chunk.modules),
    };
  } finally {
    await new Promise((resolve, reject) => {
      compiler.close((error) => (error ? reject(error) : resolve(undefined)));
    });
  }
}

const budgets = JSON.parse(readFileSync(BUDGETS, 'utf8'));
/** @type {string[]} */
const problems = [];
/** @type {Record<string, { raw: number, gzip: number }>} */
const measured = {};
if (!existsSync(join(root, 'dist/index.js'))) {
  console.error('dist/index.js is missing: run `npm run build` before checking bundle sizes.');
  process.exit(1);
}

const workDir = mkdtempSync(join(tmpdir(), 'de-bundle-size-'));

try {
  for (const consumer of CONSUMERS) {
    const { sizes, initialModules, allModules } = await bundle(workDir, consumer);
    measured[consumer.name] = sizes;
    for (const module of matchingModules(initialModules, consumer.lazy).slice(0, 5)) {
      problems.push(`${consumer.name} loads ${module} with the entry; it must load on first use`);
    }
    for (const pattern of consumer.holds) {
      if (matchingModules(allModules, [pattern]).length === 0) {
        problems.push(`${consumer.name} holds no ${pattern} module; it no longer measures it`);
      }
    }
  }
} finally {
  rmSync(workDir, { recursive: true, force: true });
}

const kb = (/** @type {number} */ bytes) => `${(bytes / 1024).toFixed(1)} KB`.padStart(10);
for (const [name, { raw, gzip }] of Object.entries(measured)) {
  console.log(`${name.padEnd(22)}${kb(raw)} raw${kb(gzip)} gzip`);
}

let success = `${CONSUMERS.length} consumer bundles are within their budgets.`;
if (flag('update')) {
  writeFileSync(BUDGETS, `${JSON.stringify(updatedBudgets(measured, budgets), null, 2)}\n`);
  console.log(
    `\nWrote the measured baselines to ${BUDGETS}; review the change before committing it.`,
  );
} else {
  const comparison = compareBudgets(measured, budgets);
  for (const note of comparison.notes) {
    console.log(`note: ${note}; lower its baseline with \`npm run check:bundle-size -- --update\``);
  }
  for (const growth of comparison.suspended) console.log(`not enforced: ${growth}`);
  if (budgets.suspended) {
    const { since, cause } = budgets.suspended;
    console.log(`The growth limits are suspended since ${since}. ${cause}`);
    success = `${CONSUMERS.length} consumer bundles measured; sizes past their allowance, not enforced: ${comparison.suspended.length}.`;
  }
  problems.push(...comparison.problems);
}

reportProblems(problems, {
  heading: 'Consumer bundle problems',
  hint: 'A deliberate size change updates the baselines: `npm run check:bundle-size -- --update`.',
  success,
});
