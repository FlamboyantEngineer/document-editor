// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('optional reference presentation', () => {
  it('DOCE-ENTRY-1.5 ships explicit layered document styles without importing lab layout', () => {
    const manifest = JSON.parse(readFileSync('package.json', 'utf8')) as {
      exports: Record<string, unknown>;
      sideEffects: string[];
    };
    expect(manifest.exports['./reference.css']).toBe('./reference.css');
    expect(manifest.sideEffects).toContain('**/*.css');
    const css = readFileSync('reference.css', 'utf8');
    expect(css).toContain('layer(document-reference)');
    expect(css).not.toContain('ui-components/reference.css');
    const cache = mkdtempSync(join(tmpdir(), 'document-reference-pack-'));
    let packed: string;
    try {
      packed = execFileSync(
        'npm',
        ['pack', '--dry-run', '--json', '--ignore-scripts', '--cache', cache],
        { encoding: 'utf8', timeout: 10_000 },
      );
    } finally {
      rmSync(cache, { recursive: true, force: true });
    }
    const packs = JSON.parse(packed) as { files: { path: string }[] }[];
    const files = packs[0]?.files.map(({ path }) => path) ?? [];
    for (const path of [
      'reference.css',
      'labs/reference/document.css',
      'labs/reference/editor-chrome.css',
    ])
      expect(files).toContain(path);
    expect(files).not.toContain('labs/reference.css');
  }, 15_000);
});
