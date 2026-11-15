#!/usr/bin/env node
// The packed-consumer check (README, Tested set): packs the built package, installs it into an
// empty consumer beside the tested set and the git pins, with strict peers and no overrides, then
// installs again from the consumer's lock with `npm ci`. Each package the editor shares with the
// host must be installed once, and the server entries must load in Node. Needs the built package
// (`npm run build`) and read access to the pinned repositories.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packTarball, runNpm } from '@flamboyantengineer/ui-components/tooling/lib/npm.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = async (path) => JSON.parse(await readFile(path, 'utf8'));
const manifest = await read(join(root, 'package.json'));
const tested = await read(join(root, 'scripts/tested-set.json'));

const pins = Object.fromEntries(
  tested.pinned.map((name) => {
    const pin = manifest.devDependencies[name];
    assert.match(pin ?? '', /^git\+https:\/\/.+#[0-9a-f]{40}$/, `${name} is not pinned by commit.`);
    return [name, pin];
  }),
);
// Each peer the tested set names must be one the package accepts exactly as tested.
for (const [name, version] of Object.entries(tested.packages)) {
  const range = manifest.peerDependencies[name];
  if (range && /^\d/.test(range))
    assert.equal(range, version, `${name}: peer ${range}, tested ${version}.`);
}

// Every copy of `name` under `directory`'s node_modules, nested ones included.
async function copiesOf(directory, name, found = []) {
  const modules = join(directory, 'node_modules');
  const entries = await readdir(modules, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    const scoped = entry.name.startsWith('@');
    const names = scoped
      ? (await readdir(join(modules, entry.name))).map((each) => `${entry.name}/${each}`)
      : [entry.name];
    for (const each of names) {
      if (each === name) found.push(join(modules, each));
      await copiesOf(join(modules, each), name, found);
    }
  }
  return found;
}

const consumer = await mkdtemp(join(tmpdir(), 'document-editor-consumer-'));
try {
  const { filename } = packTarball(root, consumer);
  await writeFile(
    join(consumer, 'package.json'),
    JSON.stringify({
      name: 'consumer',
      private: true,
      type: 'module',
      dependencies: {
        [manifest.name]: `file:./${filename}`,
        ...pins,
        ...tested.packages,
      },
    }),
  );
  const strict = ['--strict-peer-deps', '--no-audit', '--no-fund'];
  runNpm(['install', ...strict], { cwd: consumer, stdio: 'inherit' });
  await rm(join(consumer, 'node_modules'), { recursive: true });
  runNpm(['ci', ...strict], { cwd: consumer, stdio: 'inherit' });

  for (const name of tested.shared) {
    const copies = await copiesOf(consumer, name);
    assert.equal(
      copies.length,
      1,
      `${name} is installed ${copies.length} times: ${copies.join(', ')}`,
    );
  }
  await writeFile(
    join(consumer, 'consumer.mjs'),
    `
    import assert from 'node:assert/strict';
    const document = await import('${manifest.name}/document');
    const model = await import('${manifest.name}/model');
    const collab = await import('${manifest.name}/collab');
    assert.equal(typeof document.tableFromRows, 'function');
    assert.equal(typeof model.createDocumentSchema, 'function');
    assert.equal(typeof collab.openRoomChangeGuard, 'function');
    `,
  );
  execFileSync(process.execPath, [join(consumer, 'consumer.mjs')], {
    cwd: consumer,
    stdio: 'inherit',
  });
  console.log(
    `The packed package installs strictly beside the tested set, sharing ${tested.shared.length} packages.`,
  );
} finally {
  await rm(consumer, { recursive: true, force: true });
}
