#!/usr/bin/env node
// Splits browser tests into CI shards of about equal running time (DOCE-LABS-10.1). Playwright's own
// `--shard` cuts the list into runs of equal length in file order, so the shard that draws the slow
// files runs three times as long as another. This deals the tests out by their recorded seconds
// and writes one shard's tests as a `--test-list` file, checked to select exactly those tests.
//
//   node scripts/lab-shards.mjs plan --shards 4 --shard 2 --out <file> -- --project=chromium ...
//   node scripts/lab-shards.mjs record < <CI logs of every shard of one run>
//
// `record` rewrites scripts/lab-durations.json from the list reporter's lines. A test it has no
// time for counts as the median test, so a stale file only costs balance, never a test.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { listedTests, planShards, recordDurations } from './lib/lab-shards.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const DURATIONS = fileURLToPath(new URL('lab-durations.json', import.meta.url));

function listTests(args) {
  const output = execFileSync('npx', ['playwright', 'test', '--list', '--reporter=json', ...args], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  return listedTests(JSON.parse(output));
}

function plan(values, projectArgs) {
  const count = Number(values.shards);
  const index = Number(values.shard);
  if (!Number.isInteger(count) || !Number.isInteger(index) || index < 1 || index > count)
    throw new Error(
      `--shard ${String(values.shard)} --shards ${String(values.shards)} names no shard`,
    );
  if (!values.out) throw new Error('plan needs --out <file>');
  const durations = JSON.parse(readFileSync(DURATIONS, 'utf8'));
  const shards = planShards(listTests(projectArgs), durations, count);
  const shard = shards[index - 1];
  if (!shard) throw new Error(`no shard ${String(index)}`);
  writeFileSync(values.out, `${[...new Set(shard.names)].join('\n')}\n`);
  // Playwright passes over a line that names no test and selects every test a line's titles begin,
  // so the list must select exactly the tests planned for it.
  const selected = listTests([...projectArgs, '--test-list', values.out]).length;
  if (selected !== shard.names.length)
    throw new Error(
      `${values.out} selects ${String(selected)} tests, not ${String(shard.names.length)}`,
    );
  const planned = shards.map(({ seconds }) => Math.round(seconds)).join(', ');
  console.log(
    `shard ${String(index)} of ${String(count)}: ${String(selected)} tests; planned seconds ${planned}`,
  );
}

function record() {
  const durations = recordDurations(readFileSync(0, 'utf8'));
  if (Object.keys(durations).length === 0) throw new Error('the log holds no test results');
  writeFileSync(DURATIONS, `${JSON.stringify(durations, null, 2)}\n`);
  console.log(`scripts/lab-durations.json: ${String(Object.keys(durations).length)} tests`);
}

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { shards: { type: 'string' }, shard: { type: 'string' }, out: { type: 'string' } },
});
const [command, ...projectArgs] = positionals;
if (command === 'plan') plan(values, projectArgs);
else if (command === 'record') record();
else
  throw new Error(
    'usage: lab-shards.mjs plan --shards <n> --shard <i> --out <file> -- <args> | record',
  );
