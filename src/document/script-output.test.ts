// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createDocumentSchema, readStoredContent } from '../model/index.js';
import { captionTextOf } from '../model/schema/caption-content.js';
import {
  buildScriptCode,
  buildScriptEquation,
  buildScriptFigure,
  buildScriptHeading,
  buildScriptList,
  buildScriptParagraph,
  buildScriptTable,
  buildScriptText,
} from './script-output.js';

const schema = createDocumentSchema();

// The objects stored content reads as: a table without the node that holds it and its caption.
const readObjects = (content: Parameters<typeof readStoredContent>[0]) =>
  readStoredContent(content, schema).map((node) =>
    ['table_figure', 'code_figure'].includes(node.type.name) ? (node.lastChild ?? node) : node,
  );

describe('script output builders', () => {
  it('DOCE-OBJECTS-4.5 writes text runs with their marks, leaving empty runs out', () => {
    expect(
      buildScriptText(['Plain ', { text: 'bold', bold: true }, '', { text: 'x', code: true }]),
    ).toEqual([
      { type: 'text', text: 'Plain ' },
      { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
      { type: 'text', text: 'x', marks: [{ type: 'code' }] },
    ]);
    expect(buildScriptText({ text: 'Site', italic: true, href: 'https://example.com' })).toEqual([
      {
        type: 'text',
        text: 'Site',
        marks: [{ type: 'italic' }, { type: 'link', attrs: { href: 'https://example.com' } }],
      },
    ]);
    expect(buildScriptParagraph('')).toEqual({ type: 'paragraph' });
  });

  it('DOCE-OBJECTS-4.5 builds headings, unnumbered ones too, lists and tables the document reads', () => {
    const content = [
      buildScriptHeading('Results', { level: 2 }),
      buildScriptHeading('Top'),
      buildScriptHeading('Deep', { level: 9 }),
      buildScriptHeading('Aside', { level: 2, numbered: false }),
      buildScriptList(['One', 'Two'], { ordered: true }),
      buildScriptList(['Dot']),
      buildScriptTable(
        [
          ['Name', 'Value'],
          ['a', '1'],
        ],
        { header: true },
      ),
    ];
    const nodes = readObjects(content);
    expect(nodes.map((node) => node.type.name)).toEqual([
      'heading',
      'heading',
      'heading',
      'heading',
      'ordered_list',
      'bullet_list',
      'table',
    ]);
    expect(nodes.slice(0, 4).map((node) => node.attrs.level)).toEqual([2, 1, 6, 2]);
    expect(nodes.slice(0, 4).map((node) => node.attrs.numbered)).toEqual([true, true, true, false]);
    const table = nodes[6];
    expect(table?.child(0).child(0).type.name).toBe('table_header');
    expect(table?.child(1).child(1).type.name).toBe('table_cell');
    expect(table?.child(1).child(1).textContent).toBe('1');
    expect(nodes[4]?.textContent).toBe('OneTwo');
  });
  it('DOCE-OBJECTS-4.5 gives tables, figures and code the caption a script writes, or hides it', () => {
    const content = [
      buildScriptTable([['a', '1']], { caption: '  Stock   levels ' }),
      buildScriptFigure({
        src: 'https://example.com/a.png',
        alt: 'Chart',
        caption: 'Trend',
        width: 40,
        height: 30,
      }),
      buildScriptCode('x = 1', { language: 'python', caption: false }),
      buildScriptTable([['b']]),
    ];
    const held = readStoredContent(content, schema);
    const nodes = readObjects(content);
    expect(
      nodes.map((node, index) => [
        node.type.name,
        captionTextOf(held[index] ?? node),
        node.attrs.captionEnabled,
      ]),
    ).toEqual([
      ['table', 'Stock levels', true],
      ['figure', 'Trend', true],
      ['code_block', '', false],
      ['table', '', true],
    ]);
    expect(nodes[1]?.attrs).toMatchObject({ src: 'https://example.com/a.png', alt: 'Chart' });
    expect(nodes[2]?.attrs.language).toBe('python');
    expect(nodes[2]?.textContent).toBe('x = 1');
  });

  it('DOCE-OBJECTS-4.5 writes struck text, links that open elsewhere, inline equations and host nodes', () => {
    const parts = buildScriptText([
      { text: 'gone', strike: true },
      { text: 'Site', href: 'https://example.com', newTab: true },
      { math: 'x^2' },
      { type: 'mention', attrs: { person: 'p1', label: 'Ada' } },
    ]);
    const [paragraph] = readStoredContent([{ type: 'paragraph', content: parts }], schema);
    const nodes: { name: string; marks: string[]; attrs: unknown }[] = [];
    paragraph?.forEach((node) =>
      nodes.push({
        name: node.type.name,
        marks: node.marks.map((mark) => mark.type.name),
        attrs: node.marks.find((mark) => mark.type.name === 'link')?.attrs.target,
      }),
    );
    expect(nodes).toEqual([
      { name: 'text', marks: ['strike'], attrs: undefined },
      { name: 'text', marks: ['link'], attrs: '_blank' },
      { name: 'math_inline', marks: [], attrs: undefined },
      { name: 'mention', marks: [], attrs: undefined },
    ]);
    const [equation] = readStoredContent([buildScriptEquation('\\frac{a}{b}')], schema);
    expect([equation?.type.name, equation?.textContent]).toEqual(['math_display', '\\frac{a}{b}']);
  });

  it('DOCE-OBJECTS-4.5 sets a table out: fitted, stub, alignment, widths, rules, spans and cells of paragraphs', () => {
    const content = [
      buildScriptTable(
        [
          ['Name', 'Role', 'Signed'],
          ['Ada', { paragraphs: ['Lead', { text: 'since May', italic: true }] }, 'Yes'],
          [{ paragraphs: ['No reviewers'], colspan: 3, align: 'center' }],
        ],
        {
          header: true,
          stub: true,
          align: [undefined, undefined, 'right'],
          widths: [120, 200, 80],
          rules: 'horizontal',
          caption: 'Reviewers',
        },
      ),
      buildScriptTable([['a']], { fit: 'natural', rules: 'none' }),
    ];
    const [figure, natural] = readObjects(content);
    const [held] = readStoredContent(content, schema);
    const table = figure;
    expect(held && captionTextOf(held)).toBe('Reviewers');
    expect(table?.attrs).toMatchObject({
      objectLayout: 'fit-page-width',
      tableBorderClass: 'table-border-horizontal',
    });
    expect(natural?.attrs).toMatchObject({
      objectLayout: null,
      tableBorderClass: 'table-border-none',
    });
    const rows = [0, 1, 2].map((index) => table?.child(index));
    expect(rows[0]?.child(1).attrs.colwidth).toEqual([200]);
    expect(rows[1]?.child(0).type.name).toBe('table_header');
    expect(rows[1]?.child(1).type.name).toBe('table_cell');
    expect(rows[1]?.child(1).childCount).toBe(2);
    expect(rows[1]?.child(2).attrs.textAlign).toBe('right');
    expect(rows[2]?.child(0).attrs).toMatchObject({
      colspan: 3,
      colwidth: [120, 200, 80],
      textAlign: 'center',
    });
  });
});
