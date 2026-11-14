import { describe, expect, it } from 'vitest';
import type { StoredNode, StoredSection } from '../model/format/document-format.js';
import { storedContentKey } from './dirty.js';

const footnote = (id: string, elementId: string): StoredNode => ({
  type: 'footnote',
  attrs: { id, elementId },
  content: [{ type: 'text', text: 'A note.' }],
});

const section = (id: string, note: StoredNode): StoredSection => ({
  name: null,
  content: [{ type: 'paragraph', attrs: { id }, content: [{ type: 'text', text: 'Text' }, note] }],
});

const key = (id: string, note: StoredNode) => storedContentKey([section(id, note)]);

describe('storedContentKey', () => {
  it('DOCE-SESSION-2.1 reads other element ids as no change, a footnote’s too', () => {
    expect(key('a0000002', footnote('note-1', 'b0000002'))).toBe(
      key('a0000001', footnote('note-1', 'b0000001')),
    );
  });

  it('DOCE-SESSION-2.1 reads another footnote id as a change', () => {
    expect(key('a0000001', footnote('note-2', 'b0000001'))).not.toBe(
      key('a0000001', footnote('note-1', 'b0000001')),
    );
  });
});
