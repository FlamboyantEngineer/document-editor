// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  averageDurations,
  listedTests,
  planShards,
  recordDurations,
  testName,
  // @ts-expect-error The scripts are plain JavaScript modules without declarations.
} from '../scripts/lib/lab-shards.mjs';

interface Shard {
  names: string[];
  seconds: number;
}

const plan = planShards as (
  names: string[],
  durations: Record<string, number>,
  count: number,
) => Shard[];

describe('DOCE-LABS-10.1 shards of equal time', () => {
  it('DOCE-LABS-10.1 records each test by its test-list line, without line or timestamp', () => {
    const log = [
      '2026-11-23T22:21:25.7798402Z   ✓    1 [chromium] › e2e/editor.spec.ts:317:3 › editor lab › comments on the caret block (1.6s)',
      '2026-11-23T22:21:26.0842268Z   ✓    3 [chromium-dpr-3] › e2e/pages.spec.ts:12:5 › pages at 150% (812ms)',
      '2026-11-23T22:21:27.0000000Z   -    4 [chromium-dpr-3] › e2e/pages.spec.ts:12:5 › pages at 100%',
      '2026-11-23T22:21:28.0000000Z   ✓    5 [chromium] › e2e/slow.spec.ts:1:1 › slow (1.5m)',
      '2026-11-23T22:21:29.0000000Z Running 260 tests using 4 workers',
    ].join('\n');
    expect(recordDurations(log)).toEqual({
      '[chromium-dpr-3] › pages.spec.ts › pages at 100%': 0,
      '[chromium-dpr-3] › pages.spec.ts › pages at 150%': 0.8,
      '[chromium] › editor.spec.ts › editor lab › comments on the caret block': 1.6,
      '[chromium] › slow.spec.ts › slow': 90,
    });
  });

  it('DOCE-LABS-10.1 names the tests of a listed report as their test-list lines', () => {
    const report = {
      suites: [
        {
          title: 'editor.spec.ts',
          specs: [{ title: 'top', file: 'editor.spec.ts', tests: [{ projectName: 'chromium' }] }],
          suites: [
            {
              title: 'lab',
              specs: [
                {
                  title: 'inner',
                  file: 'editor.spec.ts',
                  tests: [{ projectName: 'chromium' }, { projectName: 'chromium-dpr-3' }],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(listedTests(report)).toEqual([
      '[chromium] › editor.spec.ts › top',
      '[chromium] › editor.spec.ts › lab › inner',
      '[chromium-dpr-3] › editor.spec.ts › lab › inner',
    ]);
    expect(testName('chromium', 'a.spec.ts', ['x', 'y'])).toBe('[chromium] › a.spec.ts › x › y');
  });

  it('DOCE-LABS-10.1 deals every test into one shard, balancing the recorded seconds', () => {
    const durations = { a: 60, b: 50, c: 40, d: 30, e: 20, f: 10 };
    const shards = plan(['f', 'e', 'd', 'c', 'b', 'a'], durations, 2);
    expect(shards.flatMap((shard) => shard.names).sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(shards.map((shard) => shard.seconds)).toEqual([110, 100]);
    // In file order, as Playwright's own `--shard` cuts it, the halves would take 60 and 150.
  });

  it('DOCE-LABS-10.1 counts an unrecorded test as the median and none as free', () => {
    const shards = plan(['new', 'skipped', 'x', 'y', 'z'], { skipped: 0, x: 1, y: 3, z: 5 }, 1);
    expect(shards[0]?.seconds).toBeCloseTo(3 + 0.2 + 1 + 3 + 5);
  });

  it('DOCE-LABS-10.1 keeps tests that share a name together', () => {
    const shards = plan(['same', 'same', 'other'], { same: 5, other: 9 }, 2);
    expect(shards.map((shard) => shard.names)).toEqual([['same', 'same'], ['other']]);
  });

  it('DOCE-LABS-10.1 averages a new run into the record, keeping only the tests it holds', () => {
    expect(averageDurations({ kept: 10, removed: 4 }, { kept: 20, added: 3 })).toEqual({
      kept: 15,
      added: 3,
    });
  });
});
