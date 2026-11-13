// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createDocumentSchema, readStoredContent } from '../model/index.js';
import {
  buildScriptHeading,
  buildScriptList,
  buildScriptParagraph,
  buildScriptTable,
  buildScriptText,
} from './script-output.js';

const schema = createDocumentSchema();

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

  it('DOCE-OBJECTS-4.5 builds headings, lists and tables the document reads', () => {
    const content = [
      buildScriptHeading('Results', { level: 2 }),
      buildScriptHeading('Top'),
      buildScriptHeading('Deep', { level: 9 }),
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
    const nodes = readStoredContent(content, schema);
    expect(nodes.map((node) => node.type.name)).toEqual([
      'heading',
      'heading',
      'heading',
      'ordered_list',
      'bullet_list',
      'table',
    ]);
    expect(nodes.slice(0, 3).map((node) => node.attrs.level)).toEqual([2, 1, 6]);
    const table = nodes[5];
    expect(table?.child(0).child(0).type.name).toBe('table_header');
    expect(table?.child(1).child(1).type.name).toBe('table_cell');
    expect(table?.child(1).child(1).textContent).toBe('1');
    expect(nodes[3]?.textContent).toBe('OneTwo');
  });
});
