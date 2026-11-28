import type { LayoutBlock, SplitBlock } from './page-layout.js';

interface SplitFit {
  readonly blockHeight: number;
  /** Room after allowing for everything in the whole block. */
  readonly fitting: number;
  readonly empty: boolean;
  /** Room before allowing for anything in the block. */
  readonly vacant: () => number;
  readonly trySplit: (limit: number) => SplitBlock | null;
  readonly fits: (head: LayoutBlock) => boolean;
}

interface SearchRange {
  readonly low: number;
  readonly high: number;
  readonly fallback: SplitBlock | null;
}

function narrowSplit(fit: SplitFit, range: SearchRange): SplitBlock | null {
  let { low, high } = range;
  let best = range.fallback;
  // A longer lead can bring another citation onto this page. Shrink the trial limit without
  // charging for that citation on every shorter lead tried. Stop below layout precision.
  for (let step = 0; step < 52 && high - low > 0.000001; step += 1) {
    const limit = low + (high - low) / 2;
    const candidate = fit.trySplit(limit);
    if (candidate && !fit.fits(candidate.head)) {
      high = limit;
    } else {
      low = limit;
      if (candidate) best = candidate;
    }
  }
  return best;
}

/** Splits with room for the citations in the first fragment alone. */
export function splitWithPageHeight(fit: SplitFit): SplitBlock | null {
  const { fitting, trySplit, fits } = fit;
  const conservative = trySplit(fitting);
  const first = conservative && fits(conservative.head) ? conservative : null;
  // A split may deliberately put an oversized first table row on an empty page.
  const overflow = fit.empty && conservative && conservative.head.height > fitting;
  const fallback = first ?? (overflow ? conservative : null);

  // A rule can return null once the whole block fits the limit, even if its footnotes do not.
  const whole = fit.blockHeight - Math.max(1, fit.blockHeight) * Number.EPSILON;
  const optimistic = Math.min(fit.vacant(), whole);
  const largest = optimistic > fitting ? trySplit(optimistic) : null;
  if (largest && fits(largest.head)) return largest;

  const low = conservative && !fallback ? 0 : fitting;
  const high = largest ? optimistic : fitting;
  return high > low ? narrowSplit(fit, { low, high, fallback }) : fallback;
}
