import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { afterEach, describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { readDocumentFile } from '../model/index.js';
import { createPresence, listPeers, placePeers, presenceKey, setPeers } from './presence.js';

function stateOf(value: string) {
  const doc = readDocumentFile(
    {
      formatVersion: 1,
      sections: [
        { name: null, content: [{ type: 'paragraph', content: [{ type: 'text', text: value }] }] },
      ],
    },
    documentSchema,
  ).doc;
  return EditorState.create({ doc, plugins: [createPresence()] });
}

const start = (state: EditorState) => {
  let found = -1;
  state.doc.descendants((node, pos) => {
    if (found < 0 && node.isText) found = pos;
  });
  return found;
};

const views: EditorView[] = [];

afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
});

// A view drawing the peers, as the editor's does.
function viewOf(value: string): EditorView {
  const view = new EditorView(document.createElement('div'), { state: stateOf(value) });
  views.push(view);
  return view;
}

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

  it('DOCE-COLLAB-1.1 writes a peer’s colour only when it is a plain colour', () => {
    const view = viewOf('Shared text');
    const at = start(view.state);
    view.dispatch(
      setPeers(view.state, [
        { id: 'alan', name: 'Alan', color: 'rgb(204 0 0)', anchor: at, head: at + 2 },
        {
          id: 'grace',
          name: 'Grace',
          color: 'red; position: fixed; inset: 0; background: url(https://example.invalid/x)',
          anchor: at + 3,
          head: at + 6,
        },
      ]),
    );
    const drawn = (peer: string) =>
      [...view.dom.querySelectorAll(`[data-presence-peer="${peer}"]`)].map((element) =>
        element.getAttribute('style'),
      );
    expect(drawn('alan')).toEqual([
      '--de-presence-color: rgb(204 0 0);',
      '--de-presence-color: rgb(204 0 0)',
    ]);
    // What is not a colour is left out, and the peer shows in their slot's colour.
    expect(drawn('grace')).toEqual([null, null]);
    expect(view.dom.querySelector('[data-presence-peer="grace"]')).toHaveAttribute(
      'data-presence-slot',
    );
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

  it('DOCE-COLLAB-1.4 gives each peer a slot no other has, stacks carets and draws none without a head', () => {
    const peers = placePeers(
      Array.from({ length: 8 }, (_, index) => ({
        id: `p${String(index)}`,
        name: `P${String(index)}`,
      })),
    );
    expect(new Set(peers.map((peer) => peer.slot)).size).toBe(8);
    let state = stateOf('Alpha');
    const at = start(state) + 1;
    state = state.apply(
      setPeers(state, [
        { id: 'a', name: 'Ada', anchor: at, head: at },
        { id: 'b', name: 'Grace', anchor: at, head: at },
        { id: 'c', name: 'Hedy' },
      ]),
    );
    const carets = presenceKey.getState(state)?.decorations.find() ?? [];
    expect(carets).toHaveLength(2);
    expect(listPeers(state).map((peer) => peer.name)).toEqual(['Ada', 'Grace', 'Hedy']);
  });

  it('DOCE-COLLAB-1.6 marks the caret and selection of an idle or away peer with their status', () => {
    const state = stateOf('Shared text');
    const at = start(state);
    const next = state.apply(
      setPeers(state, [
        { id: 'grace', name: 'Grace', anchor: at, head: at + 6, status: 'away' },
        { id: 'alan', name: 'Alan', anchor: at + 2, head: at + 2, status: 'active' },
      ]),
    );
    const document = window.document;
    const view = { dom: { ownerDocument: document } };
    const statuses = (presenceKey.getState(next)?.decorations.find() ?? []).map((decoration) => {
      const spec = decoration.spec as { peer?: unknown };
      if (spec.peer) {
        const toDOM = (decoration as unknown as { type: { toDOM: (v: unknown) => Element } }).type
          .toDOM;
        return toDOM(view).getAttribute('data-presence-status');
      }
      const attrs = (decoration as unknown as { type: { attrs: Record<string, string> } }).type
        .attrs;
      return attrs['data-presence-status'] ?? null;
    });
    expect(statuses.sort()).toEqual(['away', 'away', null]);
  });

  it('DOCE-COLLAB-1.6 draws a caret again when its peer goes idle, or changes name or colour, where it stands', () => {
    const view = viewOf('Shared text');
    const grace = { id: 'grace', name: 'Grace', head: start(view.state) + 2 };
    view.dispatch(setPeers(view.state, [grace]));
    const caret = () => view.dom.querySelector('.de-presence-caret');
    expect(caret()).not.toHaveAttribute('data-presence-status');
    view.dispatch(
      setPeers(view.state, [{ ...grace, name: 'Grace H.', status: 'idle', color: '#c00' }]),
    );
    expect(caret()).toHaveAttribute('data-presence-status', 'idle');
    expect(caret()).toHaveTextContent('Grace H.');
    expect(caret()?.getAttribute('style')).toContain('#c00');
  });
});
