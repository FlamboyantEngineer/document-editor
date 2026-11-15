#!/usr/bin/env node
// Moves each git pin in package.json (a FlamboyantEngineer repository, pinned by commit) to the
// head of that repository's `dev`, for the pin-bump workflow (README, Tested set). Prints one line
// per moved pin and, under GitHub Actions, writes `changed` and the pull request's `body` to the
// step's outputs. It changes package.json alone; the workflow then installs strictly and runs the
// packed-consumer check before it proposes the set.

import { execFileSync } from 'node:child_process';
import { appendFile, readFile, writeFile } from 'node:fs/promises';

const path = new URL('../package.json', import.meta.url);
const manifest = JSON.parse(await readFile(path, 'utf8'));
const PIN = /^git\+https:\/\/github\.com\/(FlamboyantEngineer\/[\w.-]+?)\.git#([0-9a-f]{40})$/;

// The commit at the head of `dev` of a repository, read with the credentials git is given.
function devHead(repository) {
  const output = execFileSync(
    'git',
    ['ls-remote', `https://github.com/${repository}.git`, 'refs/heads/dev'],
    { encoding: 'utf8' },
  );
  const head = output.split(/\s/)[0] ?? '';
  if (!/^[0-9a-f]{40}$/.test(head)) throw new Error(`${repository} has no dev branch.`);
  return head;
}

const moved = [];
for (const field of ['dependencies', 'devDependencies']) {
  for (const [name, pin] of Object.entries(manifest[field] ?? {})) {
    const match = PIN.exec(pin);
    if (!match) continue;
    const [, repository = '', commit = ''] = match;
    const head = devHead(repository);
    if (head === commit) continue;
    manifest[field][name] = `git+https://github.com/${repository}.git#${head}`;
    moved.push({ name, repository, from: commit, to: head });
  }
}

const lines = moved.map(
  ({ name, repository, from, to }) =>
    `- \`${name}\` ${from.slice(0, 7)} to ${to.slice(0, 7)}: https://github.com/${repository}/compare/${from}...${to}`,
);
if (moved.length > 0) await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(moved.length > 0 ? lines.join('\n') : 'Every pin is at the head of dev.');

if (process.env.GITHUB_OUTPUT) {
  const body = [
    "Moves the git pins to the head of each repository's `dev`:",
    '',
    ...lines,
    '',
    'The workflow installed this set with strict peers and passed the packed-consumer check (`npm run check:consumer`) before opening this pull request. It merges once `check` passes.',
  ].join('\n');
  await appendFile(
    process.env.GITHUB_OUTPUT,
    `changed=${String(moved.length > 0)}\nbody<<PIN_BUMP_BODY\n${body}\nPIN_BUMP_BODY\n`,
  );
}
