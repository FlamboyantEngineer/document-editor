import { describe, expect, it } from 'vitest';
import { DEFAULT_TABLE_CELL_MIN_WIDTH, fitColumns, scaleColumns } from './column-widths.js';

describe('column widths', () => {
  it('DOCE-TABLES-3.7 narrows the columns that grew, the widest first', () => {
    expect(fitColumns([100, 500], [100, 300], 450)).toEqual([100, 350]);
    expect(fitColumns([100, 200], [100, 100], 450)).toEqual([100, 200]);
    expect(fitColumns([300, 300], [100, 100], 100)).toEqual([DEFAULT_TABLE_CELL_MIN_WIDTH, 68]);
  });

  it('DOCE-IMPORT-3.3 shrinks every column in proportion to fit a width', () => {
    expect(scaleColumns([200, 400], 300)).toEqual([100, 200]);
    expect(scaleColumns([100, 200], 450)).toEqual([100, 200]);
    expect(scaleColumns([], 100)).toEqual([]);
  });

  it('DOCE-IMPORT-3.3 keeps a narrow column at the minimum and shrinks the others more', () => {
    const fitted = scaleColumns([40, 1000, 1000], 400);
    expect(fitted[0]).toBe(DEFAULT_TABLE_CELL_MIN_WIDTH);
    expect(fitted[1]).toBe(fitted[2]);
    expect(fitted.reduce((sum, width) => sum + width, 0)).toBeLessThanOrEqual(400);
    expect(scaleColumns([10, 500], 100)).toEqual([10, 90]);
  });
});
