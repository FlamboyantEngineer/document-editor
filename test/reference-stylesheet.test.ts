// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('optional reference presentation', () => {
  it('DOCE-ENTRY-1.5 DOCE-ENTRY-1.6 ships explicit layered document styles without importing lab layout', () => {
    const manifest = JSON.parse(readFileSync('package.json', 'utf8')) as {
      exports: Record<string, unknown>;
      sideEffects: string[];
    };
    expect(manifest.exports['./reference.css']).toBe('./reference.css');
    expect(manifest.sideEffects).toContain('**/*.css');
    const css = readFileSync('reference.css', 'utf8');
    expect(css).toContain('layer(document-reference)');
    expect(css).not.toContain('ui-components/reference.css');
    expect(manifest.exports['./shadcn.css']).toBe('./shadcn.css');
    const shadcn = readFileSync('shadcn.css', 'utf8');
    expect(shadcn).toContain("@import './labs/reference/document.css' layer(document-reference);");
    expect(shadcn).toContain(
      "@import './labs/reference/editor-chrome.css' layer(document-reference);",
    );
    expect(shadcn).toContain("@import './labs/shadcn/editor-chrome.css' layer(document-shadcn);");
    expect(shadcn).not.toMatch(/@import [^;]*ui-components/);
    const cache = mkdtempSync(join(tmpdir(), 'document-reference-pack-'));
    let files: string[];
    // Offline: a fresh cache otherwise makes npm wait on the registry, about 7 s of a 10 s budget.
    try {
      execFileSync(
        'npm',
        [
          'pack',
          '--offline',
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
      'shadcn.css',
      'labs/shadcn/editor-chrome.css',
    ])
      expect(files).toContain(path);
    expect(files).not.toContain('labs/reference.css');
    expect(files).not.toContain('labs/shadcn.css');
    expect(files).not.toContain('labs/lab-pages.css');
  }, 15_000);
});

// The compound each `:has(` is attached to in a stylesheet: the selector text before it, back to
// the last combinator or list separator outside parentheses.
function hasSubjects(css: string): string[] {
  const subjects: string[] = [];
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (let at = text.indexOf(':has('); at >= 0; at = text.indexOf(':has(', at + 5)) {
    let depth = 0;
    let start = at;
    while (start > 0) {
      const character = text[start - 1] ?? '';
      if (character === ')') depth += 1;
      else if (character === '(') {
        if (depth === 0) break;
        depth -= 1;
      } else if (depth === 0 && /[\s>+~,{}]/.test(character)) break;
      start -= 1;
    }
    subjects.push(text.slice(start, at));
  }
  return subjects;
}

describe('reference stylesheet selectors', () => {
  it('DOCE-LABS-1.6 never makes the page, the root or a bare compound the subject of :has()', () => {
    for (const path of [
      'labs/reference/document.css',
      'labs/reference/editor-chrome.css',
      'labs/shadcn/editor-chrome.css',
    ]) {
      for (const subject of hasSubjects(readFileSync(path, 'utf8'))) {
        expect(subject, path).not.toMatch(/^(\*|body|html|:root)?$/);
      }
    }
  });

  it('DOCE-LABS-1.6 finds the subject of each :has()', () => {
    expect(hasSubjects('a > :has(b) {} p:has(> c), :is(p, h1):has(d) {} body:has(e) {}')).toEqual([
      '',
      'p',
      ':is(p, h1)',
      'body',
    ]);
  });
});
