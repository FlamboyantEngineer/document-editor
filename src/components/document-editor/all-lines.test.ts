import { describe, expect, it } from 'vitest';
import { createAllLines } from './all-lines.js';

function recorded() {
  const applied: boolean[] = [];
  return { applied, lines: createAllLines((all) => applied.push(all)) };
}

describe('createAllLines', () => {
  it('DOCE-PAGINATION-11.6 keeps the host’s every-page request through a snapshot', () => {
    const { applied, lines } = recorded();
    lines.drawAll(true);
    lines.hold()();
    expect(applied).toEqual([true]);
    lines.drawAll(false);
    expect(applied).toEqual([true, false]);
  });

  it('DOCE-PAGINATION-11.6 puts the pages near the screen back once the last of two snapshots ends', () => {
    const { applied, lines } = recorded();
    const first = lines.hold();
    const second = lines.hold();
    first();
    first();
    expect(applied).toEqual([true]);
    second();
    expect(applied).toEqual([true, false]);
  });
});
