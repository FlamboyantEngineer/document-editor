// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
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
    let files: string[];
    try {
      execFileSync(
        'npm',
        [
          'pack',
          '--ignore-scripts',
          '--foreground-scripts=false',
          '--pack-destination',
          cache,
          '--cache',
          join(cache, 'npm-cache'),
        ],
        { encoding: 'utf8', timeout: 10_000, stdio: 'pipe' },
      );
      const archives = readdirSync(cache).filter((name) => name.endsWith('.tgz'));
      expect(archives).toHaveLength(1);
      files = execFileSync('tar', ['-tzf', join(cache, archives[0] ?? '')], {
        encoding: 'utf8',
      })
        .trim()
        .split('\n')
        .map((path) => path.replace(/^package\//, ''));
    } finally {
      rmSync(cache, { recursive: true, force: true });
    }
    for (const path of [
      'reference.css',
      'labs/reference/document.css',
      'labs/reference/editor-chrome.css',
    ])
      expect(files).toContain(path);
    expect(files).not.toContain('labs/reference.css');
  }, 15_000);
});
