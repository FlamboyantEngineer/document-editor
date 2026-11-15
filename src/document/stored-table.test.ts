// @vitest-environment node
import { TableMap } from 'prosemirror-tables';
import { describe, expect, it } from 'vitest';
import ranges from '../../test/fixtures/tables/spreadsheet-ranges.json' with { type: 'json' };
import { createDocumentSchema, type DocumentFile, readStoredContent } from '../model/index.js';
import { applyStoredEdits } from './automation.js';
import { tableFromRows } from './stored-table.js';

const schema = createDocumentSchema();

// A spreadsheet range as its document insertion hands it over: A1:C3 with A1:B1 merged and C2:C3
// merged, calculated values as text.
const RANGE = [
  [{ text: 'Region', colspan: 2, rowspan: 1 }, { text: 'Total' }],
  [{ text: 'North' }, { text: '12' }, { text: '30', colspan: 1, rowspan: 2 }],
  [{ text: 'South' }, { text: '' }],
];

const cellTexts = (rows: readonly { content?: readonly unknown[] }[]) =>
  rows.map((row) =>
    (row.content as { content: { content?: { text: string }[] }[] }[]).map((cell) =>
      cell.content.map((paragraph) => paragraph.content?.[0]?.text ?? '').join('\n'),
    ),
  );

// A stored table's cells as the fixture writes them: text, and spans above 1.
const fixtureCells = (table: { content?: readonly { content?: readonly unknown[] }[] }) =>
  cellTexts(table.content ?? []).map((row, y) =>
    row.map((text, x) => ({
      text,
      ...((table.content?.[y]?.content?.[x] as { attrs?: object } | undefined)?.attrs ?? {}),
    })),
  );

describe('tables from rows', () => {
  it.each(ranges.cases)(
    'DOCE-TABLES-4.1 turns the shared spreadsheet range "$name" into its stored table',
    ({ rows, table, size }) => {
      const stored = tableFromRows(rows);
      const [node] = readStoredContent([stored], schema);
      const map = node ? TableMap.get(node) : null;

      expect(fixtureCells(stored)).toEqual(table);
      // The schema reads each value as the same text, lines and all.
      const read: string[][] = [];
      node?.forEach((row) => {
        const cells: string[] = [];
        row.forEach((cell) => cells.push(cell.textBetween(0, cell.content.size, '\n')));
        read.push(cells);
      });
      expect(read).toEqual(table.map((row) => row.map((cell) => cell.text)));
      expect([map?.width, map?.height, map?.problems ?? null]).toEqual([...size, null]);
    },
  );

  it('DOCE-TABLES-4.1 turns rows of text cells with spans into a stored table the schema reads', () => {
    const table = tableFromRows(RANGE);
    const [node] = readStoredContent([table], schema);

    expect(table.content?.[0]?.content?.[0]).toEqual({
      type: 'tableCell',
      attrs: { colspan: 2 },
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Region' }] }],
    });
    expect(table.content?.[2]?.content?.[1]).toEqual({
      type: 'tableCell',
      content: [{ type: 'paragraph' }],
    });
    expect(node?.type.name).toBe('table');
    const map = node ? TableMap.get(node) : null;
    expect([map?.width, map?.height, map?.problems ?? null]).toEqual([3, 3, null]);
  });

  it('DOCE-TABLES-4.1 keeps the lines of a cell as paragraphs', () => {
    const table = tableFromRows([[{ text: 'First line\nSecond line' }]]);

    expect(cellTexts(table.content ?? [])).toEqual([['First line\nSecond line']]);
    expect(table.content?.[0]?.content?.[0]?.content).toHaveLength(2);
  });

  it('DOCE-TABLES-4.1 drops a row that only spanned cells cover, and shortens their spans', () => {
    const table = tableFromRows([
      [
        { text: 'Merged down', rowspan: 3 },
        { text: 'Beside', rowspan: 2 },
      ],
      [],
      [{ text: 'Below' }],
    ]);
    const [node] = readStoredContent([table], schema);

    expect(table.content?.map((row) => row.content?.map((cell) => cell.attrs ?? {}))).toEqual([
      [{ rowspan: 2 }, {}],
      [{}],
    ]);
    expect(node ? (TableMap.get(node).problems ?? null) : 'unread').toBeNull();
  });

  it('DOCE-TABLES-4.1 refuses rows without a cell and spans below 1', () => {
    expect(() => tableFromRows([])).toThrow(RangeError);
    expect(() => tableFromRows([[]])).toThrow(RangeError);
    expect(() => tableFromRows([[{ text: 'x', colspan: 0 }]])).toThrow(RangeError);
    expect(() => tableFromRows([[{ text: 'x', rowspan: 1.5 }]])).toThrow(RangeError);
  });

  it('DOCE-TABLES-4.1 inserts a spreadsheet range into a stored document, with element ids', () => {
    let count = 0;
    const content = {
      formatVersion: 1,
      sections: [
        {
          name: null,
          content: [
            {
              type: 'paragraph',
              attrs: { id: 'a1a1a1a1' },
              content: [{ type: 'text', text: 'Before' }],
            },
          ],
        },
      ],
    } as DocumentFile;
    const result = applyStoredEdits(
      { content, revision: 'r1' },
      [{ op: 'insertBlocks', after: 'a1a1a1a1', content: [tableFromRows(RANGE)] }],
      {
        schema,
        revision: 'r1',
        actor: { id: 'host', kind: 'system' },
        mode: 'direct',
        newId: () => (0xd0000000 + (count += 1)).toString(16),
      },
    );
    if (!result.ok) throw new Error(result.error.message);

    const inserted = result.content.sections[0]?.content[1];
    expect(inserted?.type).toBe('table');
    expect(inserted?.attrs?.id).toMatch(/^[0-9a-f]{8}$/);
    expect(cellTexts(inserted?.content ?? [])).toEqual([
      ['Region', 'Total'],
      ['North', '12', '30'],
      ['South', ''],
    ]);
    expect(inserted?.content?.[1]?.content?.[2]?.attrs).toMatchObject({ rowspan: 2 });
  });
});
