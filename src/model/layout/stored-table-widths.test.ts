import { describe, expect, it } from 'vitest';
import type { StoredNode } from '../format/document-format.js';
import { fitStoredTables } from './stored-table-widths.js';

const cell = (colwidth: number[] | null, colspan = 1): StoredNode => ({
  type: 'tableCell',
  attrs: { ...(colspan > 1 ? { colspan } : {}), ...(colwidth ? { colwidth } : {}) },
  content: [{ type: 'paragraph' }],
});

const table = (...rows: StoredNode[][]): StoredNode => ({
  type: 'table',
  content: rows.map((content) => ({ type: 'tableRow', content })),
});

const widths = (node: StoredNode | undefined) =>
  node?.content?.map((row) => row.content?.map((each) => each.attrs?.colwidth));

describe('fitting stored tables', () => {
  it('DOCE-IMPORT-3.3 shrinks a wide table, spanned cells included, to the width', () => {
    const wide = table([cell([300]), cell([300]), cell([600])], [cell([300, 300], 2), cell([600])]);
    const [fitted] = fitStoredTables([wide], 600);
    expect(widths(fitted)).toEqual([
      [[150], [150], [300]],
      [[150, 150], [300]],
    ]);
  });

  it('DOCE-IMPORT-3.3 fits tables nested in other blocks and leaves narrow ones as they are', () => {
    const narrow = table([cell([100]), cell([100])]);
    const quote: StoredNode = { type: 'blockquote', content: [table([cell([900]), cell([300])])] };
    const [kept, inQuote] = fitStoredTables([narrow, quote], 400);
    expect(kept).toBe(narrow);
    expect(widths(inQuote?.content?.[0])).toEqual([[[300], [100]]]);
  });

  it('DOCE-IMPORT-3.3 leaves a table whose widths are unset', () => {
    const unset = table([cell(null), cell([900])]);
    expect(fitStoredTables([unset], 400)).toEqual([unset]);
  });
});
