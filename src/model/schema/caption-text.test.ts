import { describe, expect, it } from 'vitest';
import { findNode, parseMarkup } from '../../../test/document-markup.js';
import { formatCaptionLineText } from './caption-text.js';
import { tableCaptionLineStyle, tableColumnTotalCss } from './object-layout.js';

const tableOf = (widths: (number | null)[]) => {
  const cells = widths
    .map((width) => `<td${width === null ? '' : ` data-colwidth="${String(width)}"`}><p>A</p></td>`)
    .join('');
  const table = findNode(parseMarkup(`<table><tbody><tr>${cells}</tr></tbody></table>`), 'table');
  if (!table) throw new Error('No table');
  return table;
};

describe('caption line helpers', () => {
  it('DOCE-OBJECTS-2.4 writes a caption line as text, its spaces collapsed', () => {
    expect(
      formatCaptionLineText({
        elementName: ' Table ',
        numbering: '1.1',
        captionText: 'Max\n limits',
      }),
    ).toBe('Table 1.1 - Max limits');
    expect(
      formatCaptionLineText({
        elementName: 'Table',
        numbering: '2',
        captionText: 'Limits',
        continuedSuffix: '- (continued)',
      }),
    ).toBe('Table 2 - Limits (continued)');
    expect(formatCaptionLineText({ elementName: 'Figure', continuedSuffix: 'cont.' })).toBe(
      'Figure - cont.',
    );
  });

  it('DOCE-OBJECTS-2.4 spans a caption line across its table once every column has a width', () => {
    expect(tableCaptionLineStyle(tableOf([120, null]))).toEqual({});
    const table = tableOf([120, 80]);
    expect(tableCaptionLineStyle(table)).toEqual({ width: tableColumnTotalCss([120, 80], table) });
  });
});
