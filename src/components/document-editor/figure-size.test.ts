import { describe, expect, it } from 'vitest';
import { clampFigureSize, FIGURE_BOUNDS, resizeFigure, sizeRatio } from './figure-size.js';

const PAGE = { min: 16, maxWidth: 600, maxHeight: 900 };

describe('resizeFigure', () => {
  it('DOCE-OBJECTS-1.4 keeps the proportions while locked, from either side', () => {
    const sizing = { locked: true, ratio: 2, bounds: PAGE };
    expect(
      resizeFigure({ width: 400, height: 200 }, { side: 'width', value: 300 }, sizing),
    ).toEqual({ width: 300, height: 150 });
    expect(
      resizeFigure({ width: 400, height: 200 }, { side: 'height', value: 100 }, sizing),
    ).toEqual({ width: 200, height: 100 });
    expect(
      resizeFigure({ width: 400, height: 200 }, { side: 'width', value: null }, sizing),
    ).toEqual({ width: null, height: null });
  });

  it('DOCE-OBJECTS-1.4 sets each side on its own while unlocked or without proportions', () => {
    const unlocked = { locked: false, ratio: 2, bounds: PAGE };
    expect(
      resizeFigure({ width: 400, height: 200 }, { side: 'height', value: 300 }, unlocked),
    ).toEqual({ width: 400, height: 300 });
    const unknown = { locked: true, ratio: null, bounds: PAGE };
    expect(
      resizeFigure({ width: null, height: null }, { side: 'width', value: 250 }, unknown),
    ).toEqual({ width: 250, height: null });
  });

  it('DOCE-OBJECTS-1.4 clamps to the page, keeping the proportions while locked', () => {
    const locked = { locked: true, ratio: 2, bounds: PAGE };
    expect(
      resizeFigure({ width: 400, height: 200 }, { side: 'width', value: 1200 }, locked),
    ).toEqual({ width: 600, height: 300 });
    expect(resizeFigure({ width: 400, height: 200 }, { side: 'height', value: 4 }, locked)).toEqual(
      {
        width: 32,
        height: 16,
      },
    );
    const unlocked = { locked: false, ratio: 2, bounds: PAGE };
    expect(
      resizeFigure({ width: 400, height: 200 }, { side: 'width', value: 1200 }, unlocked),
    ).toEqual({ width: 600, height: 200 });
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
