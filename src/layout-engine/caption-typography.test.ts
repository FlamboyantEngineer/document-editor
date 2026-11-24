import { beforeEach, describe, expect, it } from 'vitest';
import { installFakeCanvas } from '../../test/canvas-fixtures.js';
import { documentSchema } from '../../test/document-markup.js';
import type { TemplateFile } from '../model/format/template-format.js';
import { BASE_TEMPLATE } from '../model/templates/base-template.js';
import { createTextLayout } from './text-layout.js';
import { blockTypography, captionLabelFont } from './typography.js';

function caption(type: 'figure_caption' | 'table_caption' | 'code_caption', text: string) {
  const node = documentSchema.nodes[type]?.create(null, documentSchema.text(text));
  if (!node) throw new Error(`schema has no ${type}`);
  return node;
}

const styled: TemplateFile = {
  ...BASE_TEMPLATE,
  styles: {
    ...BASE_TEMPLATE.styles,
    table: {
      ...BASE_TEMPLATE.styles?.table,
      caption: {
        alignment: 'center',
        text: { size: '10px', italic: true },
        label: { weight: 700 },
      },
    },
  },
};

beforeEach(() => {
  installFakeCanvas();
});

describe('captions', () => {
  it('DOCE-PAGINATION-9.11 lays a caption out in its caption text font, unset values the paragraph’s', () => {
    for (const type of ['figure_caption', 'table_caption', 'code_caption'] as const) {
      expect(blockTypography(caption(type, 'a'), { template: BASE_TEMPLATE })).toMatchObject({
        font: { family: 'Arial', size: 12, weight: 400, italic: false },
        leading: 18,
        align: 'left',
        marginTop: 0,
        marginBottom: 0,
      });
    }
    const table = blockTypography(caption('table_caption', 'a'), { template: styled });
    expect(table).toMatchObject({
      font: { family: 'Arial', size: 10, italic: true },
      leading: 15,
      align: 'center',
    });
    // The label takes the caption label font, unset values the caption text's.
    expect(captionLabelFont(caption('table_caption', 'a'), table, { template: styled })).toEqual({
      family: 'Arial',
      size: 10,
      weight: 700,
      italic: true,
    });
    expect(captionLabelFont(documentSchema.text('a'), table, { template: styled })).toBeNull();
  });

  it('DOCE-PAGINATION-9.11 draws the label before the caption text on its first line', () => {
    const engine = createTextLayout({ template: styled });
    const laid = engine.layoutText(caption('table_caption', 'aaaa'), {
      width: 400,
      label: 'Table 1 - ',
    });
    if (!laid.ok) throw new Error(laid.reason);
    // "Table 1 - " at 10px is seven characters of 5px and three spaces of 2.5px; "aaaa" 20px.
    expect(laid.table.lines[0]).toMatchObject({ from: 0, to: 4, width: 42.5 + 20 });
    expect(laid.table.height).toBe(15);
  });

  it('DOCE-PAGINATION-9.11 lays a code caption out in its caption font, at the left of its box', () => {
    const coded: TemplateFile = {
      ...BASE_TEMPLATE,
      styles: {
        ...BASE_TEMPLATE.styles,
        codeBlock: {
          ...BASE_TEMPLATE.styles?.codeBlock,
          size: '9px',
          caption: { alignment: 'right', text: { size: '10px' } },
        },
      },
    };
    const node = caption('code_caption', 'aaaa');
    // The caption takes its own text font over the paragraph's, not the code's, and the stylesheet
    // draws it at the left whatever its alignment.
    expect(blockTypography(node, { template: coded })).toMatchObject({
      font: { family: 'Arial', size: 10, weight: 400, italic: false },
      leading: 15,
      align: 'left',
    });
    const laid = createTextLayout({ template: coded }).layoutText(node, {
      width: 400,
      label: '1 - ',
    });
    if (!laid.ok) throw new Error(laid.reason);
    // "1 - " at 10px is two characters of 5px and two spaces of 2.5px; "aaaa" 20px.
    expect(laid.table.lines).toMatchObject([{ from: 0, to: 4, width: 15 + 20, left: 0 }]);
  });

  it('DOCE-PAGINATION-9.11 refuses a caption whose label font is not served', () => {
    const template: TemplateFile = {
      ...styled,
      styles: {
        ...styled.styles,
        figure: { caption: { label: { font: 'Georgia' } } },
      },
    };
    const engine = createTextLayout({ template, isFontServed: (family) => family === 'Arial' });
    const node = caption('figure_caption', 'aaaa');
    expect(engine.layoutText(node, { width: 400 }).ok).toBe(true);
    expect(engine.layoutText(node, { width: 400, label: 'Figure 1 - ' })).toEqual({
      ok: false,
      reason: 'font not served: Georgia',
    });
  });
});
