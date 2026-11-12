import { type EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSessionRooms, type SessionRooms } from '../../test/session-rooms.js';
import { listPeers } from '../engine/presence.js';
import { undoCommand } from '../engine/undo-commands.js';
import { FULL_CAPABILITIES } from '../host/capabilities.js';
import { createMemoryHost, type MemoryHostOptions } from '../host/memory-host.js';
import type { DocumentFile } from '../model/format/document-format.js';
import { createDocumentSession, type DocumentSession } from './document-session.js';

const DOCUMENT: DocumentFile = {
  formatVersion: 1,
  sections: [
    {
      name: null,
      content: [
        {
          type: 'paragraph',
          attrs: { id: 'a0000001' },
          content: [{ type: 'text', text: 'Hello' }],
        },
      ],
    },
  ],
};

let rooms: SessionRooms | null = null;
const sessions: DocumentSession[] = [];
const views: EditorView[] = [];

afterEach(async () => {
  for (const view of views.splice(0)) view.destroy();
  for (const session of sessions.splice(0)) session.close();
  await rooms?.close();
  rooms = null;
});

const roomsFor = (content: DocumentFile = DOCUMENT, options: Partial<SessionRoomsOptions> = {}) => {
  rooms = createSessionRooms({ documents: [{ id: 'doc', content }], ...options });
  return rooms;
};
type SessionRoomsOptions = Parameters<typeof createSessionRooms>[0];

// A session for `person` on the rooms, with a memory host's other adapters.
function openAs(person: string, options: MemoryHostOptions = {}) {
  const host = createMemoryHost({ person: { id: person, name: person }, ...options });
  const session = createDocumentSession({
    host: { ...host, collaboration: rooms?.adapter(person) },
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

const textOf = (state: EditorState) => state.doc.textBetween(0, state.doc.content.size);

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

describe('createDocumentSession in room mode', () => {
  it('DOCE-SESSION-3.2 opens a document in its room once the connection synced', async () => {
    roomsFor();
    const session = openAs('ada');
    expect(session.mode).toBe('room');
    expect(session.status.get().load).toBe('connecting');
    expect(await session.ready).toBe(true);
    const document = shown(session);
    expect(textOf(document.state)).toBe('Hello');
    expect(document.pin).toBeNull();
    expect(document.capabilities).toEqual(FULL_CAPABILITIES);
    expect(document.editingMode).toBe('edit');
    expect(session.status.get().load).toBe('ready');
  });

  it('DOCE-SESSION-3.2 reports a host with no rooms and a refused connection', async () => {
    const session = createDocumentSession({
      host: createMemoryHost(),
      documentId: 'doc',
      mode: 'room',
    });
    sessions.push(session);
    expect(await session.ready).toBe(false);
    expect(session.status.get()).toMatchObject({ load: 'failed', error: { kind: 'unavailable' } });
    roomsFor(DOCUMENT, { refused: ['eve'] });
    const refused = openAs('eve');
    expect(await refused.ready).toBe(false);
    expect(refused.status.get()).toMatchObject({ load: 'failed', error: { kind: 'denied' } });
    expect(refused.document.get()).toBeNull();
  });

  it('DOCE-SESSION-3.2 keeps two readers of a room on the same document', async () => {
    roomsFor();
    const ada = openAs('ada');
    const grace = openAs('grace');
    await Promise.all([ada.ready, grace.ready]);
    const view = mount(ada);
    mount(grace);
    view.dispatch(view.state.tr.insertText('Well, ', 1));
    await vi.waitFor(() => expect(textOf(shown(grace).state)).toBe('Well, Hello'));
  });

  it('DOCE-COLLAB-6.3 undoes only the reader’s own change in a room', async () => {
    roomsFor();
    const ada = openAs('ada');
    const grace = openAs('grace');
    await Promise.all([ada.ready, grace.ready]);
    const adaView = mount(ada);
    const graceView = mount(grace);
    adaView.dispatch(adaView.state.tr.insertText('Well, ', 1));
    await vi.waitFor(() => expect(textOf(shown(grace).state)).toBe('Well, Hello'));
    graceView.dispatch(graceView.state.tr.insertText('!', graceView.state.doc.content.size - 3));
    await vi.waitFor(() => expect(textOf(shown(ada).state)).toBe('Well, Hello!'));
    expect(undoCommand(adaView.state, adaView.dispatch, adaView)).toBe(true);
    await vi.waitFor(() => expect(textOf(shown(grace).state)).toBe('Hello!'));
    expect(textOf(adaView.state)).toBe('Hello!');
  });

  it('DOCE-SESSION-3.3 follows the room’s status and waits for it to store changes', async () => {
    const room = roomsFor();
    const session = openAs('ada');
    await session.ready;
    const view = mount(session);
    view.dispatch(view.state.tr.insertText('Oh ', 1));
    expect(session.hasUnsavedChanges()).toBe(true);
    expect(session.status.get()).toMatchObject({ save: 'saving', dirty: true });
    expect(await session.flush()).toBe(true);
    await vi.waitFor(() => expect(session.status.get()).toMatchObject({ save: 'saved' }));
    expect(session.hasUnsavedChanges()).toBe(false);
    room.providers.at(-1)?.disconnect();
    await vi.waitFor(() => expect(session.status.get().save).toBe('offline'));
  });

  it('DOCE-SESSION-3.4 narrows what the reader may do by the connection’s gate', async () => {
    roomsFor(DOCUMENT, { readers: ['grace'] });
    const session = openAs('grace');
    await session.ready;
    await vi.waitFor(() => expect(session.connection.get()?.phase).toBe('read-only'));
    expect(shown(session).capabilities).toMatchObject({
      edit: false,
      suggest: false,
      comment: true,
    });
    expect(shown(session).editingMode).toBe('comment');
  });

  it('DOCE-SESSION-3.8 tells the connection’s phase and gate', async () => {
    const room = roomsFor();
    const session = openAs('ada');
    expect(session.connection.get()).toEqual({
      phase: 'connecting',
      gate: { editable: false, locked: false },
    });
    await session.ready;
    await vi.waitFor(() => expect(session.connection.get()?.phase).toBe('synced'));
    expect(shown(session).editingMode).toBe('edit');
    room.providerOf('ada')?.disconnect();
    await vi.waitFor(() => expect(session.connection.get()?.phase).toBe('offline'));
    // A document that synced stays editable offline; its changes wait for the room.
    expect(session.connection.get()?.gate).toEqual({ editable: true, locked: false });
    expect(shown(session).editingMode).toBe('edit');
    const store = createDocumentSession({
      host: createMemoryHost({ documents: [{ id: 'doc', content: DOCUMENT }] }),
      documentId: 'doc',
      mode: 'store',
    });
    sessions.push(store);
    await store.ready;
    expect(store.connection.get()).toBeNull();
  });

  it('DOCE-SESSION-3.9 shows the other people in the room', async () => {
    roomsFor();
    const ada = openAs('ada');
    const grace = openAs('grace');
    await Promise.all([ada.ready, grace.ready]);
    const adaView = mount(ada);
    const graceView = mount(grace);
    adaView.dispatch(adaView.state.tr.setSelection(TextSelection.create(adaView.state.doc, 3)));
    await vi.waitFor(() =>
      expect(listPeers(graceView.state).map((peer) => peer.id)).toContain('ada'),
    );
    expect(listPeers(graceView.state).find((peer) => peer.id === 'ada')?.head).toBe(3);
  });

  it('DOCE-SESSION-3.5 pins another template for every reader of the room', async () => {
    roomsFor();
    const templates = [
      { formatVersion: 1 as const, id: 'memo', page: { size: 'US Letter' as const } },
    ];
    const ada = openAs('ada', { templates });
    const grace = openAs('grace', { templates });
    await Promise.all([ada.ready, grace.ready]);
    expect(await ada.setTemplate({ id: 'memo', revision: null })).toBe(true);
    expect(shown(ada).template.page?.size).toBe('US Letter');
    await vi.waitFor(() => expect(shown(grace).pin?.id).toBe('memo'));
    await vi.waitFor(() => expect(shown(grace).template.page?.size).toBe('US Letter'));
  });

  it('DOCE-SESSION-3.7 connects through a room provider', async () => {
    const room = roomsFor();
    const connected = await room.adapter('ada').connect('doc');
    if (!connected.ok) throw new Error('The rooms did not connect.');
    const connection = connected.value;
    await connection.whenSynced;
    expect(connection.state()).toMatchObject({ status: 'connected', access: 'read-write' });
    expect(connection.unconfirmedUpdate()).toBeNull();
    connection.close();
    expect(room.sockets.at(-1)?.closedByClient).toBe(true);
  });

  it('DOCE-SESSION-3.6 ends its connection when it closes', async () => {
    const room = roomsFor();
    const session = openAs('ada');
    await session.ready;
    session.close();
    await vi.waitFor(() => expect(room.sockets.at(-1)?.closedByClient).toBe(true));
    const early = openAs('grace');
    early.close();
    expect(await early.ready).toBe(false);
    expect(room.providers.at(-1)?.getState().status).toBe('disconnected');
  });
});
