// Shared lab discovery and server address for the lab scripts and the browser tests.

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { root } from './script.mjs';

export { root };
export const labsDir = join(root, 'labs');
export const labSourceDir = join(labsDir, 'src');

/** Where the lab server listens by default; `LABS_PORT` picks another port. */
export const LABS_HOST = '127.0.0.1';
export const LABS_PORT = Number(process.env.LABS_PORT ?? 4183);

const LAB_SOURCE = /\.lab\.tsx?$/;
const spikeDir = join(labSourceDir, 'spikes');

/**
 * The labs with a source, by name: `labs/src/<name>.lab.ts` or `.lab.tsx`, and the spikes'
 * `labs/src/spikes/<name>.lab.tsx` as `spike-<name>`.
 */
export function listLabSources() {
  const labs = readdirSync(labSourceDir)
    .filter((file) => LAB_SOURCE.test(file))
    .map((file) => ({ name: file.replace(LAB_SOURCE, ''), file: join(labSourceDir, file) }));
  const spikes = existsSync(spikeDir)
    ? readdirSync(spikeDir)
        .filter((file) => LAB_SOURCE.test(file))
        .map((file) => ({
          name: `spike-${file.replace(LAB_SOURCE, '')}`,
          file: join(spikeDir, file),
        }))
    : [];
  return [...labs, ...spikes].sort((left, right) => left.name.localeCompare(right.name));
}

/** The lab pages, by name: `labs/<name>.html` other than the index. */
export function listLabPages() {
  return readdirSync(labsDir)
    .filter((name) => name.endsWith('.html') && name !== 'index.html')
    .map((name) => name.slice(0, -'.html'.length))
    .sort();
}
