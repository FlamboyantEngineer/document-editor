import { describe, expect, it } from 'vitest';
import {
  headingNumberText,
  objectNumberText,
  parseNumberingStyle,
  resolveObjectNumbering,
} from '../index.js';

describe('number text', () => {
  it('DOCE-NUMBERING-5.1 writes a heading number as its counter content prints it', () => {
    const format = parseNumberingStyle('A.1.');
    expect(headingNumberText(format, [2])).toBe('B.');
    expect(headingNumberText(format, [2, 3])).toBe('B.3.');
    expect(headingNumberText(format, [0, 1])).toBe('0.1.');
    expect(headingNumberText(format, [1, 1, 1])).toBe('');
    expect(headingNumberText(parseNumberingStyle('1.'), [4], { prefix: 'Part' })).toBe('Part.4.');
    expect(headingNumberText(parseNumberingStyle('I'), [4], { prefix: 'Part ', suffix: ':' })).toBe(
      'Part IV:',
    );
  });

  it('DOCE-NUMBERING-5.2 writes an object number with its heading context as its counter content prints it', () => {
    const format = parseNumberingStyle('1.1.');
    const options = { prefix: 'Table ', captionLabel: true };
    expect(objectNumberText(format, { count: 2, headingCounters: [3, 1] }, options)).toBe(
      'Table 3.2',
    );
    expect(objectNumberText(format, { count: 1, headingCounters: [0] }, options)).toBe('Table 1');
    expect(
      objectNumberText(
        format,
        { count: 1, headingCounters: [2] },
        { prefix: '(Eq. ', suffix: ')' },
      ),
    ).toBe('(Eq. 2.1.)');
    const letters = [parseNumberingStyle('A.')];
    expect(
      objectNumberText(
        format,
        { count: 1, headingCounters: [2] },
        { headingNumbering: letters, captionLabel: true },
      ),
    ).toBe('B.1');
    expect(
      objectNumberText(parseNumberingStyle('1-1'), { count: 5, headingCounters: [0] }, {}),
    ).toBe('5');
    expect(
      objectNumberText(parseNumberingStyle('1~1'), { count: 5, headingCounters: [0] }, {}),
    ).toBe('0~5');
  });

  it("DOCE-NUMBERING-5.3 numbers an object one by one with its kind's label when its numbering leaves them unset", () => {
    const table = resolveObjectNumbering({}, 'table');
    expect(table.prefix).toBe('Table ');
    expect(objectNumberText(table.config, { count: 3, headingCounters: [2] }, table)).toBe(
      'Table 3',
    );
    expect(resolveObjectNumbering({}, 'codeBlock').prefix).toBe('Code Block ');
    expect(resolveObjectNumbering({}, 'figure').prefix).toBe('Figure ');
    expect(resolveObjectNumbering({}, 'equation').prefix).toBe('(Eq. ');
    // A prefix the template sets, empty included, is its own; an empty format numbers nothing.
    const own = resolveObjectNumbering(
      { figure: { numbering: { prefix: '', format: '' } } },
      'figure',
    );
    expect(own.prefix).toBe('');
    expect(own.config.levels).toEqual([]);
    expect(
      resolveObjectNumbering({ table: { numbering: { enabled: false } } }, 'table').config.levels,
    ).toEqual([]);
  });
});
