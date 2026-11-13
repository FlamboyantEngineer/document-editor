import type { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSessionRooms, type SessionRooms } from '../../test/session-rooms.js';
import { createMemoryHost, type MemoryHost } from '../host/memory-host.js';
import type { DocumentFile } from '../model/format/document-format.js';
import { createDocumentSession, type DocumentSession } from './document-session.js';

const paragraph = (id: string, text: string) => ({
  type: 'paragraph',
  attrs: { id },
  content: [{ type: 'text', text }],
});

const file = (one: string, two: string): DocumentFile => ({
  formatVersion: 1,
  sections: [{ name: null, content: [paragraph('a0000001', one), paragraph('a0000002', two)] }],
});

let rooms: SessionRooms | null = null;
const sessions: DocumentSession[] = [];
const views: EditorView[] = [];

afterEach(async () => {
  for (const view of views.splice(0)) view.destroy();
  for (const session of sessions.splice(0)) session.close();
  await rooms?.close();
  rooms = null;
});

const roomsFor = (content: DocumentFile) => {
  rooms = createSessionRooms({ documents: [{ id: 'doc', content }] });
  return rooms;
};

function openAs(host: MemoryHost, person: string, options?: { offline?: boolean }) {
  const session = createDocumentSession({
    host: { ...host, collaboration: rooms?.adapter(person, options) },
    documentId: 'doc',
    mode: 'room',
  });
  sessions.push(session);
  return session;
}

const shown = (session: DocumentSession) => {
  const document = session.document.get();
  if (!document) throw new Error('The session has no document.');
  return document;
};

const textOf = (state: EditorState) => state.doc.textBetween(0, state.doc.content.size, '|');

// An editor view on the session's state, as `DocumentEditor` mounts it, so the room binds.
function mount(session: DocumentSession) {
  const view: EditorView = new EditorView(document.createElement('div'), {
    state: shown(session).state,
    dispatchTransaction: (tr) => {
      const next = view.state.apply(tr);
      view.updateState(next);
      session.update(next);
    },
  });
  views.push(view);
  return view;
}

// The view follows the session's state, as `DocumentEditor` does when the state changes.
function follow(session: DocumentSession, view: EditorView) {
  return session.document.subscribe((next) => {
    if (next && next.state !== view.state) view.updateState(next.state);
  });
}

// Types at the start of the document's text.
function typeFirst(view: EditorView, text: string) {
  let at = -1;
  view.state.doc.descendants((node, pos) => {
    if (at < 0 && node.isText) at = pos;
    return at < 0;
  });
  view.dispatch(view.state.tr.insertText(text, at));
}

// Ada edits the first paragraph offline and leaves, with the edit kept as a draft.
async function editOffline(room: SessionRooms, host: MemoryHost) {
  const session = openAs(host, 'ada');
  await session.ready;
  const view = mount(session);
  // The room confirmed the document as it opened: the base an offline edit merges from.
  await vi.waitFor(async () => {
    const draft = await host.drafts.get('doc', 'room');
    expect(draft.ok && draft.value?.mode === 'room' && draft.value.confirmed).toBeTruthy();
  }, 5000);
  room.providerOf('ada')?.disconnect();
  typeFirst(view, 'Offline ');
  host.memory.emitLifecycle('hidden');
  await vi.waitFor(async () => {
    const draft = await host.drafts.get('doc', 'room');
    expect(draft.ok && draft.value?.mode === 'room' && draft.value.unconfirmed).toBeTruthy();
  }, 5000);
  session.close();
}

describe('room-mode drafts in a session', () => {
  it('DOCE-SESSION-6.10 opens on its draft and sends the offline edit once connected', async () => {
    const room = roomsFor(file('Hello', 'World'));
    const host = createMemoryHost({ person: { id: 'ada', name: 'Ada' } });
    await editOffline(room, host);
    const again = openAs(host, 'ada');
    await again.ready;
    expect(textOf(shown(again).state)).toBe('Offline Hello|World');
    const view = mount(again);
    follow(again, view);
    const grace = openAs(createMemoryHost({ person: { id: 'grace', name: 'Grace' } }), 'grace');
    await grace.ready;
    await vi.waitFor(() => expect(textOf(shown(grace).state)).toBe('Offline Hello|World'));
  });

  it('DOCE-SESSION-6.10 merges a draft into a room that started a new generation', async () => {
    const room = roomsFor(file('Hello', 'World'));
    const host = createMemoryHost({ person: { id: 'ada', name: 'Ada' } });
    await editOffline(room, host);
    await room.startOver([{ id: 'doc', content: file('Hello', 'World anew') }]);
    const again = openAs(host, 'ada');
    await again.ready;
    await vi.waitFor(() => expect(textOf(shown(again).state)).toBe('Offline Hello|World anew'));
    expect(again.conflicts.get()).toEqual([]);
    const view = mount(again);
    follow(again, view);
    const grace = openAs(createMemoryHost({ person: { id: 'grace', name: 'Grace' } }), 'grace');
    await grace.ready;
    await vi.waitFor(() => expect(textOf(shown(grace).state)).toBe('Offline Hello|World anew'));
  });

  it('DOCE-SESSION-6.10 merges what the reader typed after opening on a draft the room then refuses', async () => {
    const room = roomsFor(file('Hello', 'World'));
    const host = createMemoryHost({ person: { id: 'ada', name: 'Ada' } });
    await editOffline(room, host);
    await room.startOver([{ id: 'doc', content: file('Hello', 'World anew') }]);
    const again = openAs(host, 'ada', { offline: true });
    await again.ready;
    const view = mount(again);
    follow(again, view);
    typeFirst(view, 'Still ');
    expect(textOf(view.state)).toBe('Still Offline Hello|World');
    room.providerOf('ada')?.connect();
    await vi.waitFor(() =>
      expect(textOf(shown(again).state)).toBe('Still Offline Hello|World anew'),
    );
    expect(again.conflicts.get()).toEqual([]);
  });

  it('DOCE-SESSION-6.10 leaves a block both changed for the reader to settle', async () => {
    const room = roomsFor(file('Hello', 'World'));
    const host = createMemoryHost({ person: { id: 'ada', name: 'Ada' } });
    await editOffline(room, host);
    await room.startOver([{ id: 'doc', content: file('Hello there', 'World') }]);
    const again = openAs(host, 'ada');
    await again.ready;
    await vi.waitFor(() => expect(again.conflicts.get()).toMatchObject([{ id: 'a0000001' }]));
    expect(textOf(shown(again).state)).toBe('Hello there|World');
    const kept = await host.drafts.get('doc', 'room');
    expect(kept.ok && kept.value?.mode === 'room' && kept.value.unconfirmed).toBeTruthy();
    const view = mount(again);
    follow(again, view);
    await again.resolveConflict('a0000001', 'mine');
    expect(textOf(shown(again).state)).toBe('Offline Hello|World');
    // Bound to the room, the editor takes the settled block once.
    await vi.waitFor(() => expect(textOf(view.state)).toBe('Offline Hello|World'));
    expect(again.conflicts.get()).toEqual([]);
    const grace = openAs(createMemoryHost({ person: { id: 'grace', name: 'Grace' } }), 'grace');
    await grace.ready;
    await vi.waitFor(() => expect(textOf(shown(grace).state)).toBe('Offline Hello|World'));
    expect(textOf(view.state)).toBe('Offline Hello|World');
  });
});
