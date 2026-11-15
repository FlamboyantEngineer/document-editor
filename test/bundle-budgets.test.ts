// @vitest-environment node
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  allowedGrowth,
  chunksOf,
  compareBudgets,
  matchingModules,
  measureFiles,
  updatedBudgets,
  // @ts-expect-error The scripts are plain JavaScript modules without declarations.
} from '../scripts/lib/bundle-budgets.mjs';

interface Sizes {
  raw: number;
  gzip: number;
}

interface Budgets {
  allowance: { relative: number; absolute: number };
  consumers: Record<string, Sizes>;
}

interface Comparison {
  problems: string[];
  notes: string[];
}

const budgets: Budgets = {
  allowance: { relative: 0.05, absolute: 2048 },
  consumers: { editor: { raw: 100_000, gzip: 30_000 } },
};

const compare = compareBudgets as (measured: Record<string, Sizes>, budgets: Budgets) => Comparison;

describe('consumer bundle budgets', () => {
  it('DOCE-ENTRY-2.1 allows the larger of the relative and the absolute growth', () => {
    expect(allowedGrowth(100_000, budgets.allowance)).toBe(5000);
    expect(allowedGrowth(10_000, budgets.allowance)).toBe(2048);
  });

  it('DOCE-ENTRY-2.1 fails a consumer that grew past its allowance, raw or gzipped', () => {
    expect(compare({ editor: { raw: 105_000, gzip: 30_000 } }, budgets).problems).toEqual([]);
    const { problems } = compare({ editor: { raw: 105_001, gzip: 32_049 } }, budgets);
    expect(problems).toHaveLength(2);
    expect(problems[0]).toMatch(/^editor raw .* grew by/);
    expect(problems[1]).toMatch(/^editor gzip .* grew by/);
  });

  it('DOCE-ENTRY-2.1 notes a consumer that shrank, so its baseline can be lowered', () => {
    const { problems, notes } = compare({ editor: { raw: 90_000, gzip: 30_000 } }, budgets);
    expect(problems).toEqual([]);
    expect(notes).toEqual([expect.stringMatching(/^editor raw .* shrank by 9\.8 KB$/)]);
  });

  it('DOCE-ENTRY-2.1 fails a consumer without a budget and a budget without a consumer', () => {
    const { problems } = compare({ panels: { raw: 1, gzip: 1 } }, budgets);
    expect(problems).toEqual([
      'panels has no budget; run `npm run check:bundle-size -- --update`',
      'editor has a budget but no consumer',
    ]);
  });

  it('DOCE-ENTRY-2.1 writes the measurements as baselines and keeps the allowance', () => {
    const measured = { editor: { raw: 1, gzip: 2 } };
    expect(updatedBudgets(measured, budgets)).toEqual({ ...budgets, consumers: measured });
  });

  it('DOCE-ENTRY-2.1 measures each file gzipped on its own', () => {
    const files = [Buffer.from('a'.repeat(1000)), Buffer.from('b'.repeat(500))];
    const gzip = files.reduce((total, file) => total + gzipSync(file, { level: 9 }).length, 0);
    expect(measureFiles(files)).toEqual({ raw: 1500, gzip });
  });

  it('DOCE-ENTRY-2.2 tells the chunks that load with the entry from those an import() loads', () => {
    const module = (name: string) => ({ readableIdentifier: () => name });
    const chunk = (initial: boolean, files: string[], modules: unknown[]) => ({
      canBeInitial: () => initial,
      files: new Set(files),
      modules,
    });
    const compilation = {
      requestShortener: {},
      chunks: new Set([
        chunk(true, ['bundle.js'], [{ modules: new Set([module('a.js'), module('b.js')]) }]),
        chunk(false, ['1.chunk.js', '1.chunk.js.map'], [module('dialog.js')]),
      ]),
      chunkGraph: {
        getChunkModulesIterable: (target: { modules: unknown[] }) => target.modules,
      },
    };
    expect(chunksOf(compilation)).toEqual([
      { initial: true, files: ['bundle.js'], modules: ['a.js', 'b.js'] },
      { initial: false, files: ['1.chunk.js'], modules: ['dialog.js'] },
    ]);
  });

  it('DOCE-ENTRY-2.2 finds the modules a consumer must load on first use', () => {
    const modules = [
      'dist/components/document-editor/figure-dialog.js',
      'dist/components/document-editor/document-editor.js',
    ];
    expect(matchingModules(modules, ['-dialog\\.js$'])).toEqual([modules[0]]);
  });

  it('DOCE-ENTRY-2.1 keeps a reviewed budget for every consumer the check bundles', () => {
    const file = JSON.parse(
      readFileSync(new URL('../scripts/bundle-budgets.json', import.meta.url), 'utf8'),
    ) as Budgets;
    expect(Object.keys(file.consumers).sort()).toEqual([
      'editor',
      'editor-with-panels',
      'template-workspace',
    ]);
  });
});
