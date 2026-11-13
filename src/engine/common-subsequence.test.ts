import { describe, expect, it } from 'vitest';
import { commonSubsequence } from './common-subsequence.js';
import { diffText } from './text-diff.js';

const words = (count: number) => Array.from({ length: count }, (_, index) => `w${String(index)}`);

// Two lists of the same length that share all but one item and neither their start nor their end.
const shifted = (length: number): [string[], string[]] => [
  Array.from({ length }, (_, index) => (index % 2 === 0 ? 'x' : 'y')),
  Array.from({ length }, (_, index) => (index % 2 === 0 ? 'y' : 'x')),
];

describe('comparing long lists', () => {
  it('DOCE-VERSIONS-1.5 matches a long list by the items each holds once, and the gaps between them', () => {
    const kept = words(3000);
    const older = ['first', ...kept.slice(0, 1500), 'was', ...kept.slice(1500), 'last'];
    const newer = ['start', ...kept.slice(0, 1500), 'is', 'now', ...kept.slice(1500), 'end'];
    expect(commonSubsequence(older, newer)).toEqual(
      kept.map((_, index) => (index < 1500 ? [index + 1, index + 1] : [index + 2, index + 3])),
    );
  });

  it('DOCE-VERSIONS-1.2 keeps a long list in order when its first item moved to its end', () => {
    const [first = '', ...rest] = words(3000);
    expect(commonSubsequence([first, ...rest], [...rest, first])).toEqual(
      rest.map((_, index) => [index + 1, index]),
    );
  });

  it('DOCE-VERSIONS-1.5 reads a long text of repeated words changed at both ends as replaced', () => {
    const repeated = 'same '.repeat(1500);
    expect(diffText(`old ${repeated}end`, `new ${repeated}start`)).toEqual([
      { kind: 'deleted', text: `old ${repeated}end` },
      { kind: 'inserted', text: `new ${repeated}start` },
    ]);
  });

  it('DOCE-VERSIONS-1.5 matches the gaps word by word only while the pairs of one comparison last', () => {
    const [gapOlder, gapNewer] = shifted(400);
    const marks = words(8);
    const older = marks.flatMap((mark) => [mark, ...gapOlder]);
    const newer = marks.flatMap((mark) => [mark, ...gapNewer]);
    const pairs = commonSubsequence(older, newer);
    const inGap = (gap: number) =>
      pairs.filter(([index]) => index > gap * 401 && index < (gap + 1) * 401).length;
    // Six gaps of 400 by 400 pairs fit in the million a comparison may fill; the rest match nothing.
    expect(marks.map((_, gap) => inGap(gap))).toEqual([399, 399, 399, 399, 399, 399, 0, 0]);
    expect(pairs.filter(([index]) => index % 401 === 0)).toHaveLength(8);
  });
});
