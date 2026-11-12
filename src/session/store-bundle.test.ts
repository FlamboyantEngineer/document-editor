// @vitest-environment node
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

const ENTRY = fileURLToPath(new URL('./index.ts', import.meta.url));

describe('store-mode bundle', () => {
  it('DOCE-SESSION-3.1 loads no realtime library for a store-mode session', async () => {
    const result = await build({
      entryPoints: [ENTRY],
      bundle: true,
      splitting: true,
      format: 'esm',
      platform: 'browser',
      outdir: 'out',
      write: false,
      metafile: true,
      logLevel: 'silent',
      packages: 'external',
    });
    const entry = Object.values(result.metafile.outputs).find((output) => output.entryPoint);
    // What the entry loads when it loads; room mode's own code is loaded on demand.
    const imports =
      entry?.imports.filter((each) => each.kind !== 'dynamic-import').map((each) => each.path) ??
      [];
    expect(imports.length).toBeGreaterThan(0);
    expect(imports.filter((path) => /^(@y\/|lib0|yjs)/.test(path))).toEqual([]);
  }, 30_000);
});
