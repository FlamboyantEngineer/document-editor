import { describe, expect, it } from 'vitest';
import { footnoteAreaHeight } from './measure-footnotes.js';

// Three entries measured one after the other, 20 pixels each and 10 apart, in an area that takes
// 17 pixels beyond them.
const area = {
  overhead: 17,
  entries: new Map([
    ['a', 30],
    ['b', 30],
    ['c', 20],
  ]),
  last: new Map([
    ['a', 20],
    ['b', 20],
    ['c', 20],
  ]),
};

describe('footnoteAreaHeight', () => {
  it('DOCE-PAGINATION-7.2 counts the space between entries but none after the last', () => {
    expect(footnoteAreaHeight(area, ['a', 'b'])).toBe(30 + 20 + 17);
    expect(footnoteAreaHeight(area, ['b'])).toBe(20 + 17);
    expect(footnoteAreaHeight(area, ['b', 'c'])).toBe(30 + 20 + 17);
  });

  it('DOCE-PAGINATION-7.2 takes no room without entries, and each whole height without their last', () => {
    expect(footnoteAreaHeight(area, [])).toBe(0);
    expect(footnoteAreaHeight(area, ['missing'])).toBe(0);
    expect(footnoteAreaHeight({ overhead: 17, entries: area.entries }, ['a'])).toBe(30 + 17);
  });
});
