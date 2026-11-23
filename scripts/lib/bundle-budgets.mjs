// Measures the initial code of a consumer bundle and compares it with its reviewed budget
// (DOCE-ENTRY-2.1). The budgets live in `scripts/bundle-budgets.json`: each consumer's measured
// baseline in bytes, raw and gzipped, and one allowance for growth over every baseline. While the
// file holds a suspension with its cause, growth past the allowance is reported and does not fail.

import { gzipSync } from 'node:zlib';

/**
 * @typedef {{ raw: number, gzip: number }} Sizes
 * @typedef {{ since: string, cause: string }} Suspension
 * @typedef {{ allowance: { relative: number, absolute: number }, suspended?: Suspension, consumers: Record<string, Sizes> }} Budgets
 */

/**
 * The chunks of a webpack compilation: whether each loads with the entry (initial) or on first use
 * through an `import()`, its JavaScript files, and the source modules it holds, looking inside
 * concatenated modules.
 * @param {import('webpack').Compilation} compilation
 * @returns {{ initial: boolean, files: string[], modules: string[] }[]}
 */
export function chunksOf(compilation) {
  /** @type {(module: any) => any[]} */
  const leaves = (module) => (module.modules ? [...module.modules].flatMap(leaves) : [module]);
  return [...compilation.chunks].map((chunk) => ({
    initial: chunk.canBeInitial(),
    files: [...chunk.files].filter((file) => file.endsWith('.js')),
    modules: [...compilation.chunkGraph.getChunkModulesIterable(chunk)]
      .flatMap(leaves)
      .map((module) => module.readableIdentifier(compilation.requestShortener)),
  }));
}

/**
 * Raw and gzipped bytes of the files' code, each file gzipped on its own as a server sends it.
 * @param {Uint8Array[]} contents
 * @returns {Sizes}
 */
export function measureFiles(contents) {
  return contents.reduce(
    (total, code) => ({
      raw: total.raw + code.length,
      gzip: total.gzip + gzipSync(code, { level: 9 }).length,
    }),
    { raw: 0, gzip: 0 },
  );
}

/**
 * The modules whose names match any of the patterns.
 * @param {string[]} modules
 * @param {string[]} patterns
 * @returns {string[]}
 */
export function matchingModules(modules, patterns) {
  const expressions = patterns.map((pattern) => new RegExp(pattern));
  return modules.filter((name) => expressions.some((expression) => expression.test(name)));
}

/**
 * The growth a baseline allows: the larger of the relative and the absolute allowance.
 * @param {number} baseline
 * @param {Budgets['allowance']} allowance
 */
export function allowedGrowth(baseline, allowance) {
  return Math.max(Math.ceil(baseline * allowance.relative), allowance.absolute);
}

/** @param {number} bytes */
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

/**
 * Compares measurements with the budgets. Returns the problems, a consumer over its allowance or
 * without a baseline, and notes, a consumer that shrank by more than its allowance, so its baseline
 * can be lowered. While the budgets hold a suspension, a consumer over its allowance is no problem:
 * it is returned as `suspended`, to report.
 * @param {Record<string, Sizes>} measured
 * @param {Budgets} budgets
 */
export function compareBudgets(measured, budgets) {
  /** @type {string[]} */
  const problems = [];
  /** @type {string[]} */
  const notes = [];
  /** @type {string[]} */
  const suspended = [];
  const grown = budgets.suspended ? suspended : problems;
  for (const [consumer, sizes] of Object.entries(measured)) {
    const baseline = budgets.consumers[consumer];
    if (!baseline) {
      problems.push(`${consumer} has no budget; run \`npm run check:bundle-size -- --update\``);
      continue;
    }
    for (const kind of /** @type {const} */ (['raw', 'gzip'])) {
      const allowed = allowedGrowth(baseline[kind], budgets.allowance);
      const growth = sizes[kind] - baseline[kind];
      const summary = `${consumer} ${kind} ${kb(sizes[kind])} against a ${kb(baseline[kind])} baseline`;
      if (growth > allowed) grown.push(`${summary} grew by ${kb(growth)} (allowed ${kb(allowed)})`);
      else if (-growth > allowed) notes.push(`${summary} shrank by ${kb(-growth)}`);
    }
  }
  for (const consumer of Object.keys(budgets.consumers)) {
    if (!(consumer in measured)) problems.push(`${consumer} has a budget but no consumer`);
  }
  return { problems, notes, suspended };
}

/**
 * Budgets holding the measurements as baselines, keeping the reviewed allowance and a suspension.
 * @param {Record<string, Sizes>} measured
 * @param {Budgets} budgets
 * @returns {Budgets}
 */
export function updatedBudgets(measured, budgets) {
  const consumers = Object.fromEntries(
    Object.entries(measured).map(([consumer, { raw, gzip }]) => [consumer, { raw, gzip }]),
  );
  return { ...budgets, consumers };
}
