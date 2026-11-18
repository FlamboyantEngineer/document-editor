import type * as Y from '@y/y';
import { type EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { createSessionRooms, type SessionRooms } from '../../test/session-rooms.js';
import { readContent } from '../collab/delta.js';
import { openRoomChangeGuard } from '../collab/room-change-guard.js';
import { createMemoryHost } from '../host/memory-host.js';
import type { DocumentFile } from '../model/format/document-format.js';
import {
  createDocumentSession,
  type DocumentSession,
  type RoomReloadNotice,
} from './document-session.js';

const paragraph = (id: string, text: string) => ({
  type: 'paragraph',
  attrs: { id },
  content: [{ type: 'text', text }],
});

// A paragraph, then a list of two items: two writers who each delete a different item would
// leave a list with none, which the schema refuses.
const DOCUMENT: DocumentFile = {
  formatVersion: 1,
  sections: [
    {
      name: null,
      content: [
        paragraph('a0000001', 'Intro'),
        {
          type: 'bulletList',
          attrs: { id: 'a0000002' },
          content: [
            {
              type: 'listItem',
              attrs: { id: 'a0000003' },
              content: [paragraph('a0000004', 'One')],
            },
            {
              type: 'listItem',
              attrs: { id: 'a0000005' },
              content: [paragraph('a0000006', 'Two')],
            },
          ],
        },
      ],
    },
  ],
};

const EDIT = { edit: true, suggest: true, comment: true, decide: true };

let rooms: SessionRooms | null = null;
const sessions: DocumentSession[] = [];
const views: EditorView[] = [];

afterEach(async () => {
  for (const view of views.splice(0)) view.destroy();
  for (const session of sessions.splice(0)) session.close();
  await rooms?.close();
  rooms = null;
});

// Rooms whose guard lets every person edit.
function guardedRooms() {
  rooms = createSessionRooms({
    documents: [{ id: 'doc', content: DOCUMENT }],
    rules: {
      openGuard: (shadow) =>
        openRoomChangeGuard(shadow as Y.Doc, { schema: documentSchema, permissions: () => EDIT }),
    },
  });
  return rooms;
}

function openAs(person: string, onRoomReload?: (reload: RoomReloadNotice) => void) {
  const host = createMemoryHost({ person: { id: person, name: person } });
  const session = createDocumentSession({
    host: { ...host, collaboration: rooms?.adapter(person) },
    documentId: 'doc',
    mode: 'room',
    onRoomReload,
  });
  sessions.push(session);
  return session;
}

const stateOf = (session: DocumentSession) => {
  const document = session.document.get();
  if (!document) throw new Error('The session has no document.');
  return document.state;
};

const plainText = (node: EditorState['doc']) => node.textContent;
const textOf = (state: EditorState) => state.doc.textBetween(0, state.doc.content.size, ' ');

// An editor on the session's state that takes each state the session shows, as `DocumentEditor`.
function mount(session: DocumentSession) {
  const view: EditorView = new EditorView(document.createElement('div'), {
    state: stateOf(session),
    dispatchTransaction: (tr) => {
      const next = view.state.apply(tr);
      view.updateState(next);
      session.update(next);
    },
  });
  views.push(view);
  session.document.subscribe((shown) => {
    if (shown && shown.state !== view.state) view.updateState(shown.state);
  });
  return view;
}

// Deletes the list item whose text is `text`.
function deleteItem(view: EditorView, text: string) {
  let range: [number, number] | null = null;
  view.state.doc.descendants((node, pos) => {
    if (!range && node.type.name === 'list_item' && node.textContent === text)
      range = [pos, pos + node.nodeSize];
    return !range;
  });
  if (!range) throw new Error(`No item ${text}.`);
  view.dispatch(view.state.tr.delete(...(range as [number, number])));
}

const roomText = (room: SessionRooms) => {
  const doc = room.providerOf('ada')?.doc;
  const content = doc && readContent(documentSchema, doc.get('content'));
  return content ? content.textBetween(0, content.content.size, ' ') : null;
};

describe('a room that refuses a change for its merge', () => {
  it('DOCE-SESSION-3.11 DOCE-COLLAB-7.4 shows the room’s content again, keeps the caret and the connection, and tells the host', async () => {
    const room = guardedRooms();
    const reloads: RoomReloadNotice[] = [];
    const ada = openAs('ada');
    const bob = openAs('bob', (reload) => reloads.push(reload));
    await Promise.all([ada.ready, bob.ready]);
    const adaView = mount(ada);
    const bobView = mount(bob);
    // Bob's caret sits after "In", in the paragraph before the list.
    let caret = -1;
    bobView.state.doc.descendants((node, pos) => {
      if (caret < 0 && node.isText && node.text === 'Intro') caret = pos + 2;
      return caret < 0;
    });
    bobView.dispatch(bobView.state.tr.setSelection(TextSelection.create(bobView.state.doc, caret)));

    room.providerOf('bob')?.disconnect();
    deleteItem(adaView, 'One');
    await vi.waitFor(() => expect(roomText(room)).toBe('Intro Two'));
    deleteItem(bobView, 'Two');
    room.providerOf('bob')?.connect();

    await vi.waitFor(() => expect(reloads).toHaveLength(1));
    expect(reloads[0]?.reason).toBe('conflict');
    // What Bob had: his own deletion of Two.
    expect(reloads[0]?.previous.textContent).not.toContain('Two');
    expect(bob.reloads.get()).toBe(reloads[0]);
    expect(textOf(stateOf(bob))).toBe('Intro Two');
    expect(stateOf(bob).selection.head).toBe(caret);
    expect(room.providerOf('bob')?.getState()).toMatchObject({
      status: 'connected',
      refusal: null,
      refusedChanges: 1,
    });
    expect(bob.connection.get()?.gate.editable).toBe(true);

    // Bob keeps writing, on the same connection, and Ada sees it.
    bobView.dispatch(bobView.state.tr.insertText('Then '));
    await vi.waitFor(() => expect(textOf(adaView.state)).toBe('InThen tro Two'));
    expect(textOf(stateOf(bob))).toBe('InThen tro Two');
  });

  it('DOCE-SESSION-3.11 DOCE-COLLAB-7.4 sends offline changes one by one: the room keeps those that merge', async () => {
    const room = guardedRooms();
    const ada = openAs('ada');
    const bob = openAs('bob');
    await Promise.all([ada.ready, bob.ready]);
    const adaView = mount(ada);
    const bobView = mount(bob);
    const pause = () => new Promise((resolve) => setTimeout(resolve, 600));

    room.providerOf('bob')?.disconnect();
    deleteItem(adaView, 'One');
    bobView.dispatch(bobView.state.tr.insertText('First ', 3));
    await pause();
    deleteItem(bobView, 'Two');
    await pause();
    bobView.dispatch(bobView.state.tr.insertText('Third ', 3));
    expect(room.providerOf('bob')?.getUnconfirmedUpdates()).toHaveLength(3);
    room.providerOf('bob')?.connect();

    await vi.waitFor(() => expect(bob.reloads.get()?.reason).toBe('conflict'));
    // The first and third changes reach the room; the second, which collides, does not.
    const kept = 'Third First IntroTwo';
    await vi.waitFor(() => expect(plainText(stateOf(bob).doc)).toBe(kept));
    await vi.waitFor(() => expect(plainText(adaView.state.doc)).toBe(kept));
    expect(roomText(room)?.replace(/\s+/g, '')).toBe(kept.replace(/\s+/g, ''));
  });
});
