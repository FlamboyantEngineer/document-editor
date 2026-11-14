import { describe, expect, it } from 'vitest';
import { headlessEditor, readFixture } from '../../test/collab-fixtures.js';
import { CONTENT_TYPE } from './delta.js';
import { fromRelativeJSON, toRelativeJSON } from './relative-positions.js';

// A paragraph with text before a template variable, whose text the template's value fills.
const FILE = {
  formatVersion: 1 as const,
  sections: [
    {
      name: null,
      content: [
        {
          type: 'paragraph',
          attrs: { id: 'a0000001' },
          content: [
            { type: 'text', text: 'Dear ' },
            { type: 'variable', attrs: { key: 'name' }, content: [{ type: 'text', text: 'Ada' }] },
            { type: 'text', text: ', hello.' },
          ],
        },
      ],
    },
  ],
};

describe('relative positions', () => {
  it('DOCE-COLLAB-1.5 names a caret inside a template variable that follows text', () => {
    const editor = headlessEditor(readFixture(FILE));
    const { doc } = editor.state;
    const root = editor.doc.get(CONTENT_TYPE);
    let inside = -1;
    let after = -1;
    doc.descendants((node, pos) => {
      if (node.type.name === 'template_variable') inside = pos + 2;
      if (node.isText && node.text === ', hello.') after = pos + 3;
    });
    for (const pos of [inside, after]) {
      const json = toRelativeJSON(root, doc, pos);
      expect(json).not.toBeNull();
      expect(fromRelativeJSON(root, doc, json)).toBe(pos);
    }
    editor.destroy();
  });
});
