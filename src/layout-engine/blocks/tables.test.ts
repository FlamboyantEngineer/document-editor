import { describe, expect, it } from 'vitest';
import { blockBuilders, standInBlockLayout } from '../../../test/layout-engine-fixtures.js';
import type { ContainerMeasurement, LayoutBlock } from '../../model/index.js';
import { createDocumentSchema } from '../../model/schema/document-schema.js';
import { tableBorders, tableColumns } from './table-columns.js';
import type { BlockGeometry } from './types.js';

const schema = createDocumentSchema();
const { node, cell, row, table, caption } = blockBuilders(schema);
const { layout } = standInBlockLayout();
const place = { width: 600 };

function blockOf(geometry: BlockGeometry): LayoutBlock {
  if (!geometry.ok) throw new Error(geometry.reason);
  return geometry.block;
}

const rowsOf = (block: LayoutBlock) =>
  (block.measurement as ContainerMeasurement).children.map(({ top, bottom }) => [top, bottom]);

const figure = (inner: ReturnType<typeof table>, length = 0) =>
  node('table_figure', null, [caption('table_caption', length), inner]);

describe('table columns', () => {
  const borders = { vertical: 1, horizontal: 1 };
  const widths = (...values: number[]) =>
    values.map((colwidth) => cell(1, { colwidth: [colwidth] }));

  it('DOCE-PAGINATION-10.5 shares what columns without a width leave equally', () => {
    const unset = table(null, row(cell(1), cell(1)));
    expect(tableColumns(unset, { available: 601, borders, count: 2 })).toEqual({
      widths: [300, 300],
      width: 601,
    });
    const mixed = table(null, row(cell(1, { colwidth: [100] }), cell(1), cell(1)));
    expect(tableColumns(mixed, { available: 601, borders, count: 3 }).widths).toEqual([
      100, 250, 250,
    ]);
  });

  it('DOCE-PAGINATION-10.5 keeps stored widths and scales a table too wide to fit', () => {
    const sized = table(null, row(...widths(100, 200)));
    expect(tableColumns(sized, { available: 601, borders, count: 2 })).toEqual({
      widths: [100, 200],
      width: 301,
    });
    expect(tableColumns(sized, { available: 151, borders, count: 2 })).toEqual({
      widths: [50, 100],
      width: 151,
    });
  });

  it('DOCE-PAGINATION-10.5 leaves a column without a width a share when stored widths fill the table', () => {
    // A 400px column in a 200px table would take it all; the column without a width keeps an
    // equal share of the room and the stored one is scaled into the rest.
    const crowded = table(null, row(cell(1, { colwidth: [400] }), cell(1)));
    expect(tableColumns(crowded, { available: 201, borders, count: 2 })).toEqual({
      widths: [100, 100],
      width: 201,
    });
    const two = table(
      null,
      row(cell(1, { colwidth: [300] }), cell(1, { colwidth: [100] }), cell(1)),
    );
    expect(tableColumns(two, { available: 301, borders, count: 3 }).widths).toEqual([150, 50, 100]);
  });

  it('DOCE-PAGINATION-10.5 gives an aligned table’s columns a default and fits one to the page', () => {
    const centred = table({ objectLayout: 'center' }, row(cell(1, { colwidth: [150] }), cell(1)));
    expect(tableColumns(centred, { available: 601, borders, count: 2 })).toEqual({
      widths: [150, 100],
      width: 251,
    });
    const fitted = table({ objectLayout: 'fit-page-width' }, row(...widths(100, 300)));
    expect(tableColumns(fitted, { available: 401, borders, count: 2 }).widths).toEqual([100, 300]);
    expect(tableColumns(fitted, { available: 801, borders, count: 2 }).widths).toEqual([200, 600]);
  });

  it('DOCE-PAGINATION-10.5 draws the lines each border class draws', () => {
    const plain = table(null, row(cell(1)));
    expect(tableBorders(plain, 2)).toEqual({ vertical: 2, horizontal: 2 });
    expect(tableBorders(table({ tableBorderClass: 'table-border-none' }, row(cell(1))), 2)).toEqual(
      {
        vertical: 0,
        horizontal: 0,
      },
    );
    expect(
      tableBorders(table({ tableBorderClass: 'table-border-horizontal' }, row(cell(1))), 2),
    ).toEqual({ vertical: 0, horizontal: 2 });
    expect(tableBorders(table({ tableBorderClass: 'table-border-1px' }, row(cell(1))), 2)).toEqual({
      vertical: 1,
      horizontal: 1,
    });
  });
});

describe('table rows', () => {
  it('DOCE-PAGINATION-10.5 makes each row as tall as its tallest cell, with padding and borders', () => {
    // Two 299.5px columns leave 282.5px inside 8px padding and the borders: 47 characters a line.
    const block = blockOf(
      layout.layoutBlock(
        figure(table(null, row(cell(10), cell(100)), row(cell(10), cell(10)))),
        place,
      ),
    );
    // Rows of 54 + 17 and 18 + 17, with half a border above the first and below the last.
    expect(rowsOf(block)).toEqual([
      [0, 71],
      [71, 106],
    ]);
    // The empty caption still shows its label line above: 16 + 2 + 2.
    expect(block).toMatchObject({ height: 20 + 107, marginTop: 0, marginBottom: 8 });
  });

  it('DOCE-PAGINATION-10.5 grows the last row a tall cell spans, and honours a row height', () => {
    const spanning = cell(300, { rowspan: 2 });
    const block = blockOf(
      layout.layoutBlock(figure(table(null, row(spanning, cell(10)), row(cell(10)))), place),
    );
    // The spanning cell needs 7 lines (126 + 17): the second row takes the 108 the first lacks.
    expect(rowsOf(block)).toEqual([
      [0, 35],
      [35, 143],
    ]);
    const tall = blockOf(
      layout.layoutBlock(figure(table(null, row(cell(10, { rowHeight: 60 })))), place),
    );
    expect(rowsOf(tall)).toEqual([[0, 77]]);
  });

  it('DOCE-PAGINATION-10.5 DOCE-PAGINATION-4.5 sets a caption above the table within its width', () => {
    const sized = table(null, row(cell(1, { colwidth: [119] })));
    // The table is 120px wide: a 40-character caption takes two lines of 20 characters.
    const block = blockOf(layout.layoutBlock(figure(sized, 40), place));
    expect(block.height).toBe(2 + 32 + 2 + (18 + 17 + 1));
    // The caption's box goes with the rows, for a later part that shows none (DOCE-PAGINATION-4.5).
    expect(block.measurement).toMatchObject({ caption: 36 });
    const hidden = table({ captionEnabled: false }, row(cell(1, { colwidth: [119] })));
    const without = blockOf(layout.layoutBlock(figure(hidden, 40), place));
    expect(without.height).toBe(36);
    expect(without.measurement).not.toHaveProperty('caption');
  });

  it('DOCE-PAGINATION-10.5 takes no cell padding in a header', () => {
    const block = blockOf(
      layout.layoutBlock(figure(table({ captionEnabled: false }, row(cell(10)))), {
        width: 600,
        region: 'header',
      }),
    );
    expect(block).toMatchObject({ height: 18 + 1 + 1, marginBottom: 0 });
  });
});
