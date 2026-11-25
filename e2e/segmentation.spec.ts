import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import {
  SEGMENTATION_CORPUS,
  SEGMENTATION_LOCALE,
  segmentBoundaries,
} from '../src/utils/segmentation.js';

// The boundaries Node finds (src/utils/segmentation.test.ts), but where Chromium's segmentation
// data is known to differ: a new difference fails here, before its pages differ from a server's.
// Known: Chromium's Khmer dictionary splits ដកឃ្លា in two, Node's ICU 78 keeps it one word.
interface Boundaries {
  readonly graphemes: number[][];
  readonly words: number[][];
}
const stored = JSON.parse(
  readFileSync(new URL('../test/fixtures/segmentation/boundaries.json', import.meta.url), 'utf8'),
) as { node: Boundaries; chromium: Partial<Record<keyof Boundaries, Record<string, number[]>>> };

function chromiumBoundaries(): Boundaries {
  const apply = (kind: keyof Boundaries) =>
    stored.node[kind].map((each, index) => stored.chromium[kind]?.[String(index)] ?? each);
  return { graphemes: apply('graphemes'), words: apply('words') };
}

test('DOCE-PAGINATION-9.15 Chromium segments the conformance corpus as Node does, but for its known differences', async ({
  page,
}) => {
  await page.goto('about:blank');
  // The very function Node runs, as its source: it reads nothing outside itself.
  const call = `(${segmentBoundaries.toString()})(${JSON.stringify(SEGMENTATION_CORPUS)}, ${JSON.stringify(SEGMENTATION_LOCALE)})`;
  const found: unknown = await page.evaluate(call);
  expect(found).toEqual(chromiumBoundaries());
});
