// The counts behind the pages text layout engine's stats (DOCE-LABS-8.11).

import type { TextEngineStats } from './text-engine-types.js';

/**
 * The blocks the engine laid out and left to the DOM so far, with why, and the host's layout rules
 * that failed to size a node.
 */
export function createCounts(sizeErrors: () => ReadonlyMap<string, string>) {
  const counts = { laid: 0, refused: 0, reasons: new Map<string, number>() };
  return {
    laid: () => {
      counts.laid += 1;
    },
    refuse: (reason: string) => {
      counts.refused += 1;
      counts.reasons.set(reason, (counts.reasons.get(reason) ?? 0) + 1);
    },
    stats: (): TextEngineStats => ({
      ...counts,
      reasons: new Map(counts.reasons),
      sizeErrors: new Map(sizeErrors()),
    }),
  };
}
