import { EditorState } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { readDocumentFile } from '../model/index.js';
import {
  createPresence,
  isRemoteTransaction,
  listPeers,
  markRemote,
  presenceKey,
  setPeers,
} from './presence.js';

function stateOf(value: string) {
  const doc = readDocumentFile(
    {
      formatVersion: 1,
      sections: [
        { name: null, content: [{ type: 'paragraph', content: [{ type: 'text', text: value }] }] },
      ],
    },
    documentSchema,
  );
  return EditorState.create({ doc, plugins: [createPresence()] });
}

const start = (state: EditorState) => {
  let found = -1;
  state.doc.descendants((node, pos) => {
    if (found < 0 && node.isText) found = pos;
  });
  return found;
};

describe('presence', () => {
  it('DOCE-COLLAB-1.1 draws each peer’s caret and selection', () => {
    const state = stateOf('Shared text');
    const at = start(state);
    const next = state.apply(
      setPeers(state, [
        { id: 'grace', name: 'Grace', anchor: at, head: at + 6 },
        { id: 'alan', name: 'Alan', color: '#c00', anchor: at + 2, head: at + 2 },
      ]),
    );
    const decorations = presenceKey.getState(next)?.decorations.find() ?? [];
    expect(decorations).toHaveLength(3);
    expect(listPeers(next).map((peer) => peer.name)).toEqual(['Grace', 'Alan']);
  });

  it('DOCE-COLLAB-1.2 moves the peers with the writer’s changes until the next update', () => {
    const state = stateOf('Shared text');
    const at = start(state);
    const shown = state.apply(
      setPeers(state, [{ id: 'grace', name: 'Grace', anchor: at + 7, head: at + 7 }]),
    );
    const typed = shown.apply(shown.tr.insertText('Our ', at));
    expect(listPeers(typed)[0]?.head).toBe(at + 11);
    const cleared = typed.apply(setPeers(typed, []));
    expect(listPeers(cleared)).toEqual([]);
  });

  it('DOCE-COLLAB-2.1 marks remote changes and keeps them out of the history', () => {
    const state = stateOf('Shared text');
    const tr = markRemote(state.tr.insertText('!', start(state)));
    expect(isRemoteTransaction(tr)).toBe(true);
    expect(tr.getMeta('addToHistory')).toBe(false);
    expect(isRemoteTransaction(state.tr)).toBe(false);
  });
});
