// Contract snapshots as committed JSON files, formatted as the repository formats JSON, so a
// snapshot reads as a reviewable diff and passes the format check as written.

import { format, resolveConfig } from 'prettier';
import { expect } from 'vitest';

/**
 * Checks a value against the committed JSON snapshot at `path`, relative to the calling test.
 * `vitest -u` writes it; anywhere else a difference fails.
 */
export async function expectJsonSnapshot(value: unknown, path: string): Promise<void> {
  const options = await resolveConfig(new URL(import.meta.url));
  const json = await format(JSON.stringify(value), { ...options, parser: 'json' });
  await expect(json).toMatchFileSnapshot(path);
}
