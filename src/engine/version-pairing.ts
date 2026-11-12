// Pairing the blocks without element ids that two versions do not hold alike: a block edited in a
// version without ids reads as the same block edited, not as one deleted and another inserted, when
// enough of its words are kept.

/** A block as pairing reads it: its key, whether it has an id, its kind and its text. */
export interface PairedBlock {
  key: string;
  readonly id: string | null;
  readonly type: string;
  readonly authored: string;
}

// How alike two blocks' words must be, from 0 to 1, to pair them.
const minLikeness = 0.5;

// Beyond this many candidate pairs, pairing would cost more than it tells.
const MAX_PAIRS = 250_000;

const wordsOf = (text: string) => text.toLowerCase().match(/[\p{L}\p{N}]+|[^\s\p{L}\p{N}]/gu) ?? [];

// How alike two texts' words are: the share of words they hold in common, from 0 to 1.
function wordLikeness(one: string, other: string): number {
  const first = wordsOf(one);
  const second = wordsOf(other);
  if (!first.length && !second.length) return 1;
  const counts = new Map<string, number>();
  for (const word of first) counts.set(word, (counts.get(word) ?? 0) + 1);
  let shared = 0;
  for (const word of second) {
    const count = counts.get(word) ?? 0;
    if (count > 0) {
      shared += 1;
      counts.set(word, count - 1);
    }
  }
  return (2 * shared) / (first.length + second.length);
}

/**
 * Gives each newer block without an id that the older version does not hold the key of the older
 * block without an id it is most like, when they are alike enough, so the two compare as one
 * block. A block of the same kind wins a tie; each older block pairs once.
 */
export function pairBlocksWithoutIds(
  older: readonly PairedBlock[],
  newer: readonly PairedBlock[],
): void {
  const newerKeys = new Set(newer.map((block) => block.key));
  const olderKeys = new Set(older.map((block) => block.key));
  const free = older.filter((block) => !block.id && !newerKeys.has(block.key));
  const unpaired = newer.filter((block) => !block.id && !olderKeys.has(block.key));
  if (!free.length || !unpaired.length || free.length * unpaired.length > MAX_PAIRS) return;
  const taken = new Set<PairedBlock>();
  for (const block of unpaired) {
    let best: PairedBlock | null = null;
    let bestScore = minLikeness;
    for (const candidate of free) {
      if (taken.has(candidate)) continue;
      const score =
        wordLikeness(candidate.authored, block.authored) +
        (candidate.type === block.type ? 0.01 : 0);
      if (score >= bestScore && (!best || score > bestScore)) {
        best = candidate;
        bestScore = score;
      }
    }
    if (best) {
      taken.add(best);
      block.key = best.key;
    }
  }
}
