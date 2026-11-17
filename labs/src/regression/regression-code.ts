// The regression lab's linked code: every address resolves to numbered lines of sample code, the
// range its fragment names (`#L10-L20`) or forty lines, so the linked code dialog can open on any
// linked block of the regression set.

import type { CodeSourceAdapter } from '../../../src/host/index.js';

const line = (number: number) =>
  `export const reading${String(number)} = sensor.read(${String(number)}); // line ${String(number)}`;

/** Resolves an address to its lines of sample code. */
export const REGRESSION_CODE: CodeSourceAdapter = {
  resolve: (url) => {
    const range = /#L(\d+)(?:-L(\d+))?$/.exec(url);
    const first = Number(range?.[1] ?? 1);
    const last = Number(range?.[2] ?? (range ? first : 40));
    const lines = Array.from({ length: last - first + 1 }, (_, index) => line(first + index));
    return Promise.resolve({
      ok: true,
      value: { code: lines.join('\n'), language: 'typescript', startLine: first },
    });
  },
};
