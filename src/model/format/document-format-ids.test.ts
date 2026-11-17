import { describe, expect, it } from 'vitest';
import { assignStoredIds, checkStoredIds, copyDocumentFile, type DocumentFile } from '../index.js';

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
  it('DOCE-EDITING-1.6 names each missing, invalid or repeated id in a stored document', () => {
    expect(checkStoredIds(FILE)).toEqual([
      { path: 'sections[0].content[1]', problem: 'repeated', id: '0000000a' },
      { path: 'sections[0].content[2]', problem: 'invalid', id: 'list' },
      { path: 'sections[0].content[2].content[0]', problem: 'missing', id: undefined },
      { path: 'sections[0].content[2].content[0].content[0]', problem: 'missing', id: undefined },
    ]);
  });

  it('DOCE-EDITING-1.6 gives those elements fresh ids, attributed as the editor does', () => {
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

  it('DOCE-EDITING-1.6 makes the same ids each time from the same id source', () => {
    const counter = () => {
      let next = 0;
      return () => (next++).toString(16).padStart(8, '0');
    };
    const once = assignStoredIds(FILE, { newId: counter() });
    expect(assignStoredIds(FILE, { newId: counter() })).toEqual(once);
    expect(once.sections[0]?.content[1]?.attrs).toEqual({ id: '00000000' });
  });

  it('DOCE-EDITING-1.6 copies a document as a new one, with fresh ids and no comment highlights', () => {
    const commented: DocumentFile = {
      formatVersion: 1,
      sections: [
        {
          name: 'body',
          content: [
            {
              type: 'paragraph',
              attrs: { id: '0000000d', author: 'ana', aiSession: 's1' },
              content: [
                {
                  type: 'text',
                  text: 'Noted',
                  marks: [{ type: 'comment', attrs: { thread: 't1' } }, { type: 'strong' }],
                },
                { type: 'text', text: ' here', marks: [{ type: 'comment', attrs: { thread: 't1' } }] },
              ],
            },
          ],
        },
        ...FILE.sections,
      ],
    };
    let next = 0x100;
    const copy = copyDocumentFile(commented, {
      newId: () => (next++).toString(16).padStart(8, '0'),
      author: 'cy',
    });
    const [noted] = copy.sections[0]?.content ?? [];
    expect(noted).toEqual({
      type: 'paragraph',
      attrs: { id: '00000100', author: 'cy' },
      content: [
        { type: 'text', text: 'Noted', marks: [{ type: 'strong' }] },
        { type: 'text', text: ' here' },
      ],
    });
    expect(checkStoredIds(copy)).toEqual([]);
    const original = new Set<unknown>();
    const copied = new Set<unknown>();
    const collect = (file: DocumentFile, into: Set<unknown>) =>
      JSON.stringify(file, (key, value: unknown) => {
        if (key === 'id' || key === 'elementId') into.add(value);
        return value;
      });
    collect(commented, original);
    collect(copy, copied);
    expect([...copied].filter((id) => original.has(id) && id !== 'fn1')).toEqual([]);
    expect(commented.sections[0]?.content[0]?.attrs?.id).toBe('0000000d');
  });
});
