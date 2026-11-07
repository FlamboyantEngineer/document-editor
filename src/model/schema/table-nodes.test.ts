import { describe, expect, it } from 'vitest';
import { findNode, parseMarkup, roundTrip } from '../../../test/document-markup.js';

const cell = (tag: 'td' | 'th', text: string, extra = '') =>
  `<${tag} colspan="1" rowspan="1" data-text-align="left" data-vertical-align="middle" style="text-align: left; vertical-align: middle;"${extra}><p>${text}</p></${tag}>`;

describe('table nodes', () => {
  it('DOCE-SCHEMA-3.5 reads header, body and footer rows as the table body', () => {
    const html =
      '<table><caption>Totals</caption><thead><tr><th>Item</th></tr></thead><tbody><tr><td>Pen</td></tr></tbody><tfoot><tr><td>Sum</td></tr></tfoot></table>';
    const table = findNode(parseMarkup(html), 'table');
    expect(table?.childCount).toBe(3);
    expect(table?.attrs.caption).toBe('Totals');
    expect(table?.textContent).toBe('ItemPenSum');
  });

  it('DOCE-SCHEMA-3.5 keeps a table border, its caption and each cell attribute', () => {
    const colour = ' data-text-color="#333" data-background-color="#eee"';
    const styled =
      '<td colspan="1" rowspan="1" data-text-align="center" data-vertical-align="top" style="text-align: center; vertical-align: top; height: 40px; min-height: 40px; color: rgb(51, 51, 51); background-color: rgb(238, 238, 238);" data-colwidth="120" data-row-height="40"' +
      `${colour}><p>B</p></td>`;
    const html = `<table data-caption-text="Prices" class="table-border-1px"><tbody><tr>${cell('th', 'A')}${styled}</tr></tbody></table>`;
    const doc = parseMarkup(html);
    expect(findNode(doc, 'table')?.attrs).toMatchObject({
      caption: 'Prices',
      tableBorderClass: 'table-border-1px',
    });
    expect(findNode(doc, 'table_cell')?.attrs).toMatchObject({
      textAlign: 'center',
      verticalAlign: 'top',
      rowHeight: 40,
      colwidth: [120],
      textColor: '#333',
      backgroundColor: '#eee',
    });
    expect(roundTrip(html)).toBe(html);
  });

  it('DOCE-SCHEMA-3.5 sizes an aligned table from its first row', () => {
    const row = `<tr>${cell('td', 'A', ' data-colwidth="100"')}${cell('td', 'B', ' data-colwidth="300"')}</tr>`;
    const html = `<table data-object-layout="fit-page-width"><tbody>${row}</tbody></table>`;
    const written = roundTrip(html);
    expect(written).toContain(
      '<colgroup><col style="width: 25%;"><col style="width: 75%;"></colgroup>',
    );
    expect(written).toContain(
      'style="margin-left: 0px; margin-right: 0px; width: 100%; max-width: 100%;"',
    );
  });

  it('DOCE-SCHEMA-3.5 gives a new cell an empty paragraph first', () => {
    const table = findNode(parseMarkup('<table><tr><td>A</td></tr></table>'), 'table');
    const created = table?.type.schema.nodes.table_cell?.createAndFill();
    expect(created?.firstChild?.type.name).toBe('paragraph');
  });
});
