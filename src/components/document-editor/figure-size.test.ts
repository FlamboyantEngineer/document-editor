import { describe, expect, it } from 'vitest';
import {
  clampFigureSize,
  FIGURE_BOUNDS,
  figureSideProblem,
  RESIZE_BOUNDS,
  sizeRatio,
  typeFigureSide,
} from './figure-size.js';

const PAGE = { min: 16, maxWidth: 600, maxHeight: 900 };

describe('typeFigureSide', () => {
  it('DOCE-OBJECTS-1.11 keeps the proportions in whole pixels while locked, from either side', () => {
    const locked = { locked: true, ratio: 4 / 3 };
    expect(
      typeFigureSide({ width: 400, height: 300 }, { side: 'width', value: 200 }, locked),
    ).toEqual({ width: 200, height: 150 });
    expect(
      typeFigureSide({ width: 400, height: 300 }, { side: 'height', value: 100 }, locked),
    ).toEqual({ width: 133, height: 100 });
  });

  it('DOCE-OBJECTS-1.11 leaves an out-of-bounds size as typed, and each side alone while unlocked', () => {
    const locked = { locked: true, ratio: 2 };
    expect(
      typeFigureSide({ width: 400, height: 200 }, { side: 'width', value: 5000 }, locked),
    ).toEqual({ width: 5000, height: 2500 });
    const unlocked = { locked: false, ratio: 2 };
    expect(
      typeFigureSide({ width: 400, height: 200 }, { side: 'height', value: 0 }, unlocked),
    ).toEqual({ width: 400, height: 0 });
  });
});

describe('figureSideProblem', () => {
  const bounds = { ...RESIZE_BOUNDS, maxWidth: 600 };

  it('DOCE-OBJECTS-1.11 accepts whole pixels from 1 to the page content width', () => {
    expect(figureSideProblem('width', 1, bounds)).toBeNull();
    expect(figureSideProblem('width', 600, bounds)).toBeNull();
    expect(figureSideProblem('height', 4000, bounds)).toBeNull();
  });

  it('DOCE-OBJECTS-1.11 says why a side is refused', () => {
    expect(figureSideProblem('width', 0, bounds)).toEqual({ side: 'width', kind: 'min', limit: 1 });
    expect(figureSideProblem('width', 601, bounds)).toEqual({
      side: 'width',
      kind: 'max',
      limit: 600,
    });
    expect(figureSideProblem('height', 2.5, bounds)).toEqual({
      side: 'height',
      kind: 'whole',
      limit: 1,
    });
  });
});

describe('clampFigureSize', () => {
  it('DOCE-OBJECTS-1.4 lets the largest side win for a drawing too narrow for both bounds', () => {
    const size = { width: 20, height: 2000 };
    expect(clampFigureSize(size, { locked: true, ratio: sizeRatio(size), bounds: PAGE })).toEqual({
      width: 9,
      height: 900,
    });
    expect(
      clampFigureSize(
        { width: 5000, height: null },
        { locked: true, ratio: 2, bounds: FIGURE_BOUNDS },
      ),
    ).toEqual({ width: 2000, height: null });
  });
});
