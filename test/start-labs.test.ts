// @vitest-environment node
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const fixtures: string[] = [];

afterEach(() => {
  for (const fixture of fixtures.splice(0)) rmSync(fixture, { recursive: true, force: true });
});

/**
 * A checkout holding the start and serve scripts, with each file written at the given time in
 * seconds, so the scripts judge it by those times.
 */
function checkout(files: Record<string, number>) {
  const fixture = mkdtempSync(join(tmpdir(), 'de-lab-start-'));
  fixtures.push(fixture);
  mkdirSync(join(fixture, 'scripts', 'lib'), { recursive: true });
  // The scripts date from before every file, so the lab library among them is no newer than a build.
  const scripts = ['start-labs.mjs', 'serve-labs.mjs', 'lib/labs.mjs'];
  for (const script of scripts) {
    copyFileSync(join(process.cwd(), 'scripts', script), join(fixture, 'scripts', script));
    utimesSync(join(fixture, 'scripts', script), 1, 1);
  }
  for (const [path, seconds] of Object.entries(files)) {
    mkdirSync(dirname(join(fixture, path)), { recursive: true });
    writeFileSync(join(fixture, path), path);
    utimesSync(join(fixture, path), seconds, seconds);
    utimesSync(dirname(join(fixture, path)), seconds, seconds);
  }
  return fixture;
}

function dryRun(fixture: string) {
  const result = spawnSync(
    process.execPath,
    [join(fixture, 'scripts/start-labs.mjs'), '--dry-run'],
    { encoding: 'utf8' },
  );
  expect(result.status).toBe(0);
  return result.stdout.trim().split('\n');
}

const upToDate = {
  'package-lock.json': 100,
  'node_modules/.package-lock.json': 200,
  'src/editor.ts': 100,
  'labs/src/editing.lab.ts': 100,
  'labs/build/document-editor.js': 300,
};

describe('lab start', () => {
  it('DOCE-LABS-1.1 installs and builds a fresh checkout', () => {
    expect(dryRun(checkout({ 'package-lock.json': 100, 'src/editor.ts': 100 }))).toEqual([
      'npm ci: the dependencies are not installed',
      'npm run build:labs: the dependencies were installed',
    ]);
  });

  it('DOCE-LABS-1.1 does nothing while the install and the build are current', () => {
    expect(dryRun(checkout(upToDate))).toEqual(['The labs are up to date.']);
  });

  it('DOCE-LABS-1.1 reinstalls and rebuilds after the lockfile changes', () => {
    expect(dryRun(checkout({ ...upToDate, 'package-lock.json': 400 }))).toEqual([
      'npm ci: package-lock.json changed since the last install',
      'npm run build:labs: the dependencies were installed',
    ]);
  });

  it('DOCE-LABS-1.1 rebuilds after a source changes, is added or is removed', () => {
    expect(dryRun(checkout({ ...upToDate, 'src/editor.ts': 400 }))).toEqual([
      'npm run build:labs: src changed since the last build',
    ]);
    const removed = checkout(upToDate);
    rmSync(join(removed, 'labs/src/editing.lab.ts'));
    expect(dryRun(removed)).toEqual(['npm run build:labs: labs/src changed since the last build']);
  });

  it('DOCE-LABS-1.1 rebuilds after an install made outside the script', () => {
    expect(dryRun(checkout({ ...upToDate, 'node_modules/.package-lock.json': 400 }))).toEqual([
      'npm run build:labs: node_modules/.package-lock.json changed since the last build',
    ]);
  });

  it('DOCE-LABS-1.1 rebuilds after a lab stylesheet changes', () => {
    expect(dryRun(checkout({ ...upToDate, 'labs/reference.css': 400 }))).toEqual([
      'npm run build:labs: labs/reference.css changed since the last build',
    ]);
    expect(dryRun(checkout({ ...upToDate, 'labs/reference/document.css': 400 }))).toEqual([
      'npm run build:labs: labs/reference changed since the last build',
    ]);
  });

  it('DOCE-LABS-1.1 rebuilds after the labs build script changes', () => {
    expect(dryRun(checkout({ ...upToDate, 'scripts/build-labs.mjs': 400 }))).toEqual([
      'npm run build:labs: scripts/build-labs.mjs changed since the last build',
    ]);
  });

  it('DOCE-LABS-1.1 leaves a node_modules linked from another checkout alone', () => {
    const other = checkout({ 'node_modules/.package-lock.json': 200 });
    const linked = checkout({ ...upToDate, 'package-lock.json': 400 });
    rmSync(join(linked, 'node_modules'), { recursive: true });
    symlinkSync(join(other, 'node_modules'), join(linked, 'node_modules'));
    expect(dryRun(linked)).toEqual([
      'Not installing (package-lock.json changed since the last install): node_modules links elsewhere.',
      'The labs are up to date.',
    ]);
  });

  it('DOCE-LABS-1.1 serves on the next available port and honours strict-port', async () => {
    const fixture = checkout({ ...upToDate, 'labs/index.html': 100 });
    const scope = join(fixture, 'node_modules', '@flamboyantengineer');
    mkdirSync(scope, { recursive: true });
    symlinkSync(
      join(process.cwd(), 'node_modules', '@flamboyantengineer', 'ui-components'),
      join(scope, 'ui-components'),
      'junction',
    );
    const servers = new Set<ReturnType<typeof spawn>>();
    async function start(...args: string[]) {
      const server = spawn(process.execPath, [join(fixture, 'scripts/start-labs.mjs'), ...args]);
      servers.add(server);
      return new Promise<URL>((resolve, reject) => {
        let output = '';
        server.stdout.on('data', (chunk: Buffer) => {
          output += chunk.toString();
          const url = output.match(/http:\/\/127\.0\.0\.1:\d+\//)?.[0];
          if (url) resolve(new URL(url));
        });
        server.once('error', reject);
        server.once('exit', (code) => {
          servers.delete(server);
          reject(new Error(`Lab server exited with ${String(code)}`));
        });
      });
    }
    try {
      const first = await start('--port', '0');
      const next = await start('--port', first.port);
      expect(Number(next.port)).toBeGreaterThan(Number(first.port));
      expect(await (await fetch(next)).text()).toBe('labs/index.html');
      await expect(start('--strict-port', '--port', first.port)).rejects.toThrow('exited with 1');
    } finally {
      await Promise.all(
        [...servers].map(async (server) => {
          const stopped = once(server, 'exit');
          server.kill();
          await stopped;
        }),
      );
    }
  });
});
