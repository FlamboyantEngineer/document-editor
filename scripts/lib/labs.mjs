// Shared lab discovery and server address for the lab scripts and the browser tests.

import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { root } from './script.mjs';

export { root };
export const labsDir = join(root, 'labs');
export const labSourceDir = join(labsDir, 'src');

/** Where the lab server listens by default; `LABS_PORT` picks another port. */
export const LABS_HOST = '127.0.0.1';
export const LABS_PORT = Number(process.env.LABS_PORT ?? 4183);

/** The labs with a source, by name: `labs/src/<name>.lab.ts` or `.lab.tsx`. */
export function listLabSources() {
  return readdirSync(labSourceDir)
    .filter((file) => /\.lab\.tsx?$/.test(file))
    .map((file) => ({ name: file.replace(/\.lab\.tsx?$/, ''), file: join(labSourceDir, file) }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

/** The lab pages, by name: `labs/<name>.html` other than the index. */
export function listLabPages() {
  return readdirSync(labsDir)
    .filter((name) => name.endsWith('.html') && name !== 'index.html')
    .map((name) => name.slice(0, -'.html'.length))
    .sort();
}
