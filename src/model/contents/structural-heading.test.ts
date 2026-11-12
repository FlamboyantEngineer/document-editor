import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { readDocumentFile, type StoredNode } from '../index.js';
import { isStructuralHeading } from './structural-heading.js';

const heading = (value: string, attrs: Record<string, unknown> = {}): StoredNode => ({
  type: 'heading',
  attrs: { level: 1, ...attrs },
  content: [{ type: 'text', text: value }],
});

const DOCUMENT: StoredNode[] = [
  heading('Title', { title: true }),
  heading('Body'),
  {
    type: 'bulletList',
    content: [{ type: 'listItem', content: [{ type: 'paragraph' }, heading('Item')] }],
  },
  { type: 'blockquote', content: [heading('Quoted')] },
  {
    type: 'table',
    content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [heading('Cell')] }] }],
  },
  { type: 'script', content: [heading('Output')] },
  { type: 'columns', content: [{ type: 'column', content: [heading('Column')] }] },
];

// Each heading's text and whether it is structural.
function headingRule(content: StoredNode[] = DOCUMENT): Record<string, boolean> {
  const doc = readDocumentFile(
    { formatVersion: 1, sections: [{ name: null, content }] },
    documentSchema,
  );
  const found: Record<string, boolean> = {};
  doc.descendants((node, pos) => {
    if (node.type.name === 'heading') found[node.textContent] = isStructuralHeading(doc, pos);
  });
  return found;
}

describe('structural headings', () => {
  it('DOCE-CONTENTS-1.1 counts body, script output and column headings, not the title or text set as a heading', () => {
    expect(headingRule()).toEqual({
      Title: false,
      Body: true,
      Item: false,
      Quoted: false,
      Cell: false,
      Output: true,
      Column: true,
    });
  });
});
