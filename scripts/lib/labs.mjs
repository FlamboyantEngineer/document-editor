// Shared lab discovery and server address for the lab scripts and the browser tests.
// `npm run labs` starts before dependencies are installed (it runs `npm ci` itself), so the lab
// scripts take their argument and npm helpers from here, not from the shared tooling package.

import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** This repository's root, the directory that holds `scripts/`, whatever the working directory. */
export const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
export const labsDir = join(root, 'labs');
export const labSourceDir = join(labsDir, 'src');

/** Where the lab server listens by default; `LABS_PORT` picks another port. */
export const LABS_HOST = '127.0.0.1';
export const LABS_PORT = Number(process.env.LABS_PORT ?? 4183);

/** The labs with a source, by name: `labs/src/<name>.lab.ts` or `.lab.tsx`, and spikes' labs in
 * `labs/src/spikes/`. */
export function listLabSources() {
  return [labSourceDir, join(labSourceDir, 'spikes')]
    .flatMap((dir) =>
      readdirSync(dir)
        .filter((file) => /\.lab\.tsx?$/.test(file))
        .map((file) => ({ name: file.replace(/\.lab\.tsx?$/, ''), file: join(dir, file) })),
    )
    .sort((left, right) => left.name.localeCompare(right.name));
}

/** The lab pages, by name: `labs/<name>.html` other than the index. */
export function listLabPages() {
  return readdirSync(labsDir)
    .filter((name) => name.endsWith('.html') && name !== 'index.html')
    .map((name) => name.slice(0, -'.html'.length))
    .sort();
}

/**
 * Whether `--name` was given.
 * @param {string} name
 */
export function flag(name) {
  return process.argv.slice(2).includes(`--${name}`);
}

/**
 * Runs npm with these arguments; on Windows through the shell, where npm is a script.
 * @param {string[]} args
 * @param {import('node:child_process').ExecFileSyncOptions} [options]
 */
export function runNpm(args, options = {}) {
  return execFileSync('npm', args, {
    encoding: 'utf8',
    ...options,
    shell: process.platform === 'win32',
  });
}
