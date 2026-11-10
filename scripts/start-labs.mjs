#!/usr/bin/env node
// Brings the labs up to date, then serves them: installs the dependencies when package-lock.json
// changed since the last install, and builds the labs when one of their sources changed since the
// last build. --dry-run prints those steps without running them or serving.
//   node scripts/start-labs.mjs [--dry-run] [--port $LABS_PORT] [--host 127.0.0.1] [--dir labs]

import { lstatSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { runNpm } from './lib/npm.mjs';
import { flag, root } from './lib/script.mjs';

const dryRun = flag('dry-run');

// What labs/build is made from. npm rewrites node_modules/.package-lock.json on every install.
// The base library's reference stylesheet comes in with the installed dependencies; the lab
// stylesheets (labs/reference.css and the partials it bundles) are built into labs/build too.
const BUILD_SOURCES = [
  'src',
  'labs/src',
  'labs/reference.css',
  'labs/reference',
  'node_modules/.package-lock.json',
  'package.json',
  'tsconfig.json',
  'scripts/build-labs.mjs',
  'scripts/lib/labs.mjs',
];

function stat(path, follow = true) {
  try {
    return follow ? statSync(path) : lstatSync(path);
  } catch {
    return undefined;
  }
}

/** The newest change under a path, 0 when it is missing; a folder changes when an entry is added or removed. */
function lastChange(path) {
  const entry = stat(path);
  if (!entry?.isDirectory()) return entry?.mtimeMs ?? 0;
  return readdirSync(path).reduce(
    (newest, name) => Math.max(newest, lastChange(join(path, name))),
    entry.mtimeMs,
  );
}

function installReason() {
  const installed = stat(join(root, 'node_modules', '.package-lock.json'));
  if (!installed) return 'the dependencies are not installed';
  if (lastChange(join(root, 'package-lock.json')) > installed.mtimeMs)
    return 'package-lock.json changed since the last install';
  return undefined;
}

function buildReason() {
  // esbuild writes every bundle at once, so one bundle dates the whole build.
  const built = stat(join(root, 'labs', 'build', 'document-editor.js'));
  if (!built) return 'the labs are not built';
  const source = BUILD_SOURCES.find((path) => lastChange(join(root, path)) > built.mtimeMs);
  return source && `${source} changed since the last build`;
}

function run(reason, args) {
  console.log(`npm ${args.join(' ')}: ${reason}`);
  if (dryRun) return;
  try {
    runNpm(args, { cwd: root, stdio: 'inherit' });
  } catch (error) {
    process.exit(/** @type {{ status?: number }} */ (error).status ?? 1);
  }
}

const install = installReason();
// A linked node_modules belongs to another checkout, which installs it from its own lockfile.
const linked = stat(join(root, 'node_modules'), false)?.isSymbolicLink() ?? false;
const installing = install && !linked;
if (installing) run(install, ['ci']);
else if (install) console.log(`Not installing (${install}): node_modules links elsewhere.`);

const build = installing ? 'the dependencies were installed' : buildReason();
if (build) run(build, ['run', 'build:labs']);

if (!dryRun) await import('./serve-labs.mjs');
else if (!installing && !build) console.log('The labs are up to date.');
