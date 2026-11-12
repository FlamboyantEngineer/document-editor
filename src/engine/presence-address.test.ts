import { EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { readDocumentFile } from '../model/index.js';
import { createPresence, listPeers, presenceKey, setPeers } from './presence.js';
import { presenceSelection } from './presence-address.js';

function stateOf(first: string, second: string) {
  const doc = readDocumentFile(
    {
      formatVersion: 1,
      sections: [
        {
          name: null,
          content: [
            { type: 'paragraph', attrs: { id: 'p1' }, content: [{ type: 'text', text: first }] },
            { type: 'paragraph', attrs: { id: 'p2' }, content: [{ type: 'text', text: second }] },
          ],
        },
      ],
    },
    documentSchema,
  ).doc;
  return EditorState.create({ doc, plugins: [createPresence()] });
}

const textStart = (state: EditorState, text: string) => {
  let found = -1;
  state.doc.descendants((node, pos) => {
    if (found < 0 && node.isText && node.text === text) found = pos;
  });
  return found;
};

describe('presence by element address', () => {
  it('DOCE-COLLAB-1.7 gives the reader’s selection as element ids and offsets in their text', () => {
    const state = stateOf('First block', 'Second block');
    const from = textStart(state, 'First block') + 6;
    const to = textStart(state, 'Second block') + 3;
    const selected = state.apply(state.tr.setSelection(TextSelection.create(state.doc, from, to)));
    expect(presenceSelection(selected)).toEqual({
      anchor: { elementId: 'p1', offset: 6 },
      head: { elementId: 'p2', offset: 3 },
    });
  });

  it('DOCE-COLLAB-1.7 draws a peer given by address in each copy of the document, wherever it sits', () => {
    const peer = {
      id: 'grace',
      name: 'Grace',
      status: 'idle' as const,
      at: { anchor: { elementId: 'p2', offset: 0 }, head: { elementId: 'p2', offset: 6 } },
    };
    const short = stateOf('A', 'Second block');
    const long = stateOf('A much longer first block', 'Second block');
    for (const state of [short, long]) {
      const next = state.apply(setPeers(state, [peer]));
      const [placed] = listPeers(next);
      const head = placed?.head ?? -1;
      expect(next.doc.textBetween(head - 6, head)).toBe('Second');
      const caret = presenceKey
        .getState(next)
        ?.decorations.find()
        .find((each) => (each.spec as { peer?: unknown }).peer);
      expect(caret).toBeDefined();
    }
    const unknown = short.apply(
      setPeers(short, [
        { ...peer, at: { anchor: peer.at.anchor, head: { elementId: 'gone', offset: 0 } } },
      ]),
    );
    expect(listPeers(unknown)[0]?.head).toBeNull();
  });
});
