// Pairing the blocks one version holds under a key the other does not: a block whose id was made
// again reads as the same block when its kind and text are the same, and a block edited in a
// version without ids when enough of its words are kept, not as one deleted and another inserted.

/** A block as pairing reads it: its key, whether it has an id, its kind and its text. */
interface PairedBlock {
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

// Pairs each unpaired newer block with a free older block of the same kind and text, which a block
// whose id was made again is; pairs are taken in order, so a repeated text pairs in turn.
function pairSameText(free: PairedBlock[], unpaired: PairedBlock[]): void {
  const byText = new Map<string, PairedBlock[]>();
  for (const block of free) {
    const text = `${block.type}\u0000${block.authored}`;
    byText.set(text, [...(byText.get(text) ?? []), block]);
  }
  for (const block of unpaired) {
    const same = byText.get(`${block.type}\u0000${block.authored}`)?.shift();
    if (same) block.key = same.key;
  }
}

/**
 * Gives each newer block whose key the older version does not hold the key of an older block the
 * newer version does not hold, so the two compare as one block: one of the same kind and text,
 * whatever their ids; else, for a block without an id, the older block without an id it is most
 * like, when they are alike enough, a block of the same kind winning a tie. Each older block pairs
 * once.
 */
export function pairUnmatchedBlocks(
  older: readonly PairedBlock[],
  newer: readonly PairedBlock[],
): void {
  const newerKeys = new Set(newer.map((block) => block.key));
  const olderKeys = new Set(older.map((block) => block.key));
  const free = older.filter((block) => !newerKeys.has(block.key));
  const unpaired = newer.filter((block) => !olderKeys.has(block.key));
  if (!free.length || !unpaired.length) return;
  pairSameText(free, unpaired);
  const paired = new Set(unpaired.map((block) => block.key));
  pairAlike(
    free.filter((block) => !block.id && !paired.has(block.key)),
    unpaired.filter((block) => !block.id && !olderKeys.has(block.key)),
  );
}

// Pairs each block with the free one most like it, when they are alike enough.
function pairAlike(free: readonly PairedBlock[], unpaired: readonly PairedBlock[]): void {
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
