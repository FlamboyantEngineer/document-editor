import { describe, expect, it } from 'vitest';
import { assignStoredIds, checkStoredIds, type DocumentFile } from '../index.js';

const FILE: DocumentFile = {
  formatVersion: 1,
  sections: [
    {
      name: 'body',
      content: [
        { type: 'paragraph', attrs: { id: '0000000a', author: 'ana' } },
        { type: 'paragraph', attrs: { id: '0000000a', author: 'ana', aiSession: 's1' } },
        {
          type: 'bulletList',
          attrs: { id: 'list', author: 'ben' },
          content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }],
        },
        {
          type: 'paragraph',
          attrs: { id: '0000000b' },
          content: [
            { type: 'text', text: 'Cited' },
            {
              type: 'footnote',
              attrs: { id: 'fn1', elementId: '0000000c' },
              content: [{ type: 'paragraph' }],
            },
          ],
        },
      ],
    },
  ],
};

describe('stored element ids', () => {
  it('DOCE-EDITING-1.5 names each missing, invalid or repeated id in a stored document', () => {
    expect(checkStoredIds(FILE)).toEqual([
      { path: 'sections[0].content[1]', problem: 'repeated', id: '0000000a' },
      { path: 'sections[0].content[2]', problem: 'invalid', id: 'list' },
      { path: 'sections[0].content[2].content[0]', problem: 'missing', id: undefined },
      { path: 'sections[0].content[2].content[0].content[0]', problem: 'missing', id: undefined },
    ]);
  });

  it('DOCE-EDITING-1.5 gives those elements fresh ids, attributed as the editor does', () => {
    const ids = ['0000000c', '00000001', '00000002', '00000003', '00000004'];
    const file = assignStoredIds(FILE, { newId: () => ids.shift() ?? 'ffffffff', author: 'cy' });
    const [, copied, list, cited] = file.sections[0]?.content ?? [];
    expect(copied?.attrs).toEqual({ id: '00000001', author: 'cy' });
    expect(list?.attrs).toEqual({ id: '00000002', author: 'ben' });
    expect(list?.content?.[0]?.attrs).toEqual({ id: '00000003', author: 'cy' });
    expect(cited).toEqual(FILE.sections[0]?.content[3]);
    expect(checkStoredIds(file)).toEqual([]);
    expect(FILE.sections[0]?.content[1]?.attrs?.id).toBe('0000000a');
  });

  it('DOCE-EDITING-1.5 makes the same ids each time from the same id source', () => {
    const counter = () => {
      let next = 0;
      return () => (next++).toString(16).padStart(8, '0');
    };
    const once = assignStoredIds(FILE, { newId: counter() });
    expect(assignStoredIds(FILE, { newId: counter() })).toEqual(once);
    expect(once.sections[0]?.content[1]?.attrs).toEqual({ id: '00000000' });
  });
});
