import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { readDocumentFile, type StoredNode } from '../../model/index.js';
import { resolveTarget, type TableTarget } from './use-table-target.js';

const cell = (text: string): StoredNode => ({
  type: 'tableCell',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

const docWith = (before: string) =>
  readDocumentFile(
    {
      formatVersion: 1,
      sections: [
        {
          name: null,
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: before }] },
            {
              type: 'table',
              attrs: { id: 't0000001' },
              content: [{ type: 'tableRow', content: [cell('A'), cell('B')] }],
            },
          ],
        },
      ],
    },
    documentSchema,
  ).doc;

// The position of the table in a document.
function tableAt(doc: ReturnType<typeof docWith>) {
  let found = -1;
  doc.descendants((node, pos) => {
    if (found < 0 && node.type.spec.tableRole === 'table') found = pos;
    return found < 0;
  });
  return found;
}

describe('table target', () => {
  it('DOCE-TABLES-2.1 keeps the same target while its table stays where it was', () => {
    const doc = docWith('Before');
    const target: TableTarget = {
      table: tableAt(doc),
      element: null,
      id: 't0000001',
      part: null,
      row: 0,
      column: 1,
    };
    expect(resolveTarget(doc, target)).toBe(target);
    const moved = docWith('Before, longer');
    expect(resolveTarget(moved, target)).toEqual({ ...target, table: tableAt(moved) });
  });
});
