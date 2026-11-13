#!/usr/bin/env node
// Runs every check of `npm run check`. The checks of a stage run side by side and print their
// output once each finishes; a stage starts only when every check of the one before it passed.
// `--skip <check>` leaves a check out, for hosted CI, which runs the browser tests in parallel jobs.

import { parseArgs } from 'node:util';
import { startNpm } from './lib/npm.mjs';

const STAGES = [
  ['lint', 'format:check', 'typecheck', 'check:references', 'check:specs', 'build', 'build:labs'],
  ['test', 'test:labs'],
];

const skipped = parseArgs({ options: { skip: { type: 'string', multiple: true, default: [] } } })
  .values.skip;
const unknown = skipped.filter((script) => !STAGES.flat().includes(script));
if (unknown.length > 0) throw new Error(`--skip names no check: ${unknown.join(', ')}`);

function run(script) {
  const started = Date.now();
  return new Promise((resolve) => {
    const child = startNpm(['run', '--silent', script], {
      env: process.stdout.isTTY ? { ...process.env, FORCE_COLOR: '1' } : process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    child.on('close', (code, signal) => {
      const seconds = ((Date.now() - started) / 1000).toFixed(1);
      const passed = code === 0;
      const status = passed ? 'passed' : `FAILED (${signal ?? `exit ${code}`})`;
      console.log(`${status}  ${script} (${seconds}s)`);
      if (!passed && output.trim()) console.log(output.trimEnd(), '\n');
      resolve(passed);
    });
  });
}

for (const stage of STAGES.map((checks) => checks.filter((script) => !skipped.includes(script)))) {
  const results = await Promise.all(stage.map(run));
  if (results.includes(false)) {
    console.log(`\n${stage.filter((_, index) => !results[index]).join(', ')} failed.`);
    process.exitCode = 1;
    break;
  }
}
if (!process.exitCode) console.log('\nEvery check passed.');
