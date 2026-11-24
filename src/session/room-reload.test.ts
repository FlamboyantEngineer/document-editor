import * as Y from '@y/y';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deferred } from '../../test/deferred.js';
import { documentSchema } from '../../test/document-markup.js';
import { positionOf } from '../../test/projection-fixtures.js';
import { createSessionRooms, type SessionRooms } from '../../test/session-rooms.js';
import { documentToYjs } from '../collab/convert.js';
import { readContent, writeContent } from '../collab/delta.js';
import { openRoomChangeGuard } from '../collab/room-change-guard.js';
import { createRoomScope } from '../collab/room-scope.js';
import { READ_ONLY_CAPABILITIES } from '../host/capabilities.js';
import { createMemoryHost } from '../host/memory-host.js';
import type { RoomReload } from '../host/session-adapters.js';
import type { DocumentFile } from '../model/format/document-format.js';
import { readDocumentFile } from '../model/format/document-format-convert.js';
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

// A connection that swaps its Y.Doc and notifies anyone already following reloads.
function replaceable(room: SessionRooms) {
  const adapter = room.adapter('ada');
  const connect = adapter.connect.bind(adapter);
  let replay: ((reload: RoomReload<Y.Doc>) => void) | undefined;
  let replacement: Y.Doc | null = null;
  adapter.connect = async (...args) => {
    const opened = await connect(...args);
    if (!opened.ok) return opened;
    return {
      ok: true,
      value: {
        ...opened.value,
        get doc() {
          return replacement ?? opened.value.doc;
        },
        onReload: (onReload) => {
          replay = onReload;
          return () => {
            replay = undefined;
          };
        },
      },
    };
  };
  return {
    adapter,
    reload: (doc: Y.Doc) => {
      const previous = replacement ?? room.providerOf('ada')?.doc;
      if (!previous) throw new Error('The room did not open.');
      replacement = doc;
      replay?.({ reason: 'conflict', doc, previous });
      return previous;
    },
  };
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
  it('DOCE-SESSION-3.2 opens the replacement room when its first template load was still pending', async () => {
    const original = { id: 'memo', revision: 'rev-1' };
    const replacement = { id: 'letter', revision: 'rev-1' };
    rooms = createSessionRooms({
      documents: [{ id: 'doc', content: { ...DOCUMENT, template: original } }],
    });
    const { adapter, reload } = replaceable(rooms);
    const templates = [
      { formatVersion: 1 as const, id: original.id },
      { formatVersion: 1 as const, id: replacement.id, page: { size: 'US Letter' as const } },
    ];
    const host = createMemoryHost({ templates });
    const load = host.templates.load.bind(host.templates);
    const asked = deferred<void>();
    const finish = deferred<void>();
    host.templates.load = async (...args) => {
      if (args[0] === original.id) {
        asked.resolve(undefined);
        await finish.promise;
      }
      return load(...args);
    };
    const session = createDocumentSession({
      host: { ...host, collaboration: adapter },
      documentId: 'doc',
      mode: 'room',
    });
    sessions.push(session);
    await asked.promise;
    const shared = new Y.Doc();
    Y.applyUpdate(
      shared,
      documentToYjs(
        {
          ...DOCUMENT,
          template: replacement,
          sections: [{ content: [paragraph('a0000001', 'Replacement')] }],
        },
        { schema: documentSchema },
      ),
    );
    const previous = reload(shared);
    expect(session.document.get()).toBeNull();
    finish.resolve(undefined);

    expect(await session.ready).toBe(true);
    expect(textOf(stateOf(session))).toBe('Replacement');
    expect(session.document.get()).toMatchObject({
      pin: replacement,
      template: { id: replacement.id, page: { size: 'US Letter' } },
    });
    session.update((state) => state.apply(state.tr.insertText('New ')));
    expect(readContent(documentSchema, shared.get('content'))?.textContent).toBe('New Replacement');
    expect(readContent(documentSchema, previous.get('content'))?.textContent).toBe('IntroOneTwo');
    session.close();
    shared.destroy();
  });

  it('DOCE-SESSION-3.11 DOCE-SESSION-1.5 reloads content under the replacement room’s pin and follows it', async () => {
    const old = { formatVersion: 1 as const, id: 'memo', page: { size: 'A4' as const } };
    const next = { formatVersion: 1 as const, id: 'letter', page: { size: 'US Letter' as const } };
    const original = { ...DOCUMENT, template: { id: old.id, revision: 'rev-1' } };
    rooms = createSessionRooms({ documents: [{ id: 'doc', content: original }] });
    const { adapter, reload } = replaceable(rooms);
    const host = createMemoryHost({ templates: [old, next] });
    const templates = host.templates;
    if (!templates) throw new Error('The host has no templates.');
    const load = templates.load.bind(templates);
    const held: (() => void)[] = [];
    templates.load = async (...args) => {
      if (args[0] === next.id) await new Promise<void>((resolve) => held.push(resolve));
      return load(...args);
    };
    const session = createDocumentSession({
      host: { ...host, collaboration: adapter },
      documentId: 'doc',
      mode: 'room',
    });
    sessions.push(session);
    expect(await session.ready).toBe(true);
    expect((await templates.save(old.id, { template: old, baseRevision: 'rev-1' })).ok).toBe(true);
    expect(session.document.get()?.templateUpdate).not.toBeNull();

    const template = { id: next.id, revision: 'rev-1' };
    const update = documentToYjs(
      {
        ...DOCUMENT,
        template,
        sections: [{ content: [paragraph('a0000001', 'Replacement')] }],
      },
      { schema: documentSchema },
    );
    const shared = new Y.Doc();
    Y.applyUpdate(shared, update);
    reload(shared);
    expect(plainText(stateOf(session).doc)).not.toContain('Replacement');
    expect(session.document.get()?.editingMode).toBe('read');
    held.shift()?.();
    await vi.waitFor(() => expect(session.reloads.get()?.reason).toBe('conflict'));
    expect(plainText(stateOf(session).doc)).toBe('Replacement');
    expect(session.document.get()).toMatchObject({
      pin: template,
      template: { id: next.id, page: next.page },
      templateUpdate: null,
      editingMode: 'edit',
    });
    const saved = await templates.save(next.id, { template: next, baseRevision: 'rev-1' });
    if (!saved.ok) throw new Error('The template could not be saved.');
    expect(session.document.get()?.templateUpdate).toEqual({
      revision: saved.value.revision,
      sequence: saved.value.sequence,
    });
    session.close();
    shared.destroy();
  });

  it.each(['failed', 'pending'] as const)(
    'DOCE-SESSION-3.11 retries a replacement room after a peer repins it with its first load %s',
    async (prior) => {
      rooms = createSessionRooms({ documents: [{ id: 'doc', content: DOCUMENT }] });
      const { adapter, reload } = replaceable(rooms);
      const valid = { id: 'letter', revision: 'rev-1' };
      const host = createMemoryHost({ templates: [{ formatVersion: 1, id: valid.id }] });
      const load = host.templates.load.bind(host.templates);
      const stalled = deferred<Awaited<ReturnType<typeof load>>>();
      const missing = { ok: false, error: { kind: 'not-found' } } as const;
      const notice = vi.fn();
      host.templates.load = (...args) =>
        args[0] === 'missing' && prior === 'pending' ? stalled.promise : load(...args);
      const session = createDocumentSession({
        host: { ...host, collaboration: adapter },
        documentId: 'doc',
        mode: 'room',
        onRoomReload: notice,
      });
      sessions.push(session);
      expect(await session.ready).toBe(true);
      const shared = new Y.Doc();
      Y.applyUpdate(
        shared,
        documentToYjs(
          {
            ...DOCUMENT,
            template: { id: 'missing', revision: 'rev-1' },
            sections: [{ content: [paragraph('a0000001', 'Replacement')] }],
          },
          { schema: documentSchema },
        ),
      );
      try {
        reload(shared);
        if (prior === 'failed') {
          await vi.waitFor(() => expect(session.status.get().save).toBe('error'));
        }
        expect(session.reloads.get()).toBeNull();
        expect(session.document.get()?.editingMode).toBe('read');
        expect(textOf(stateOf(session))).toBe('Intro One Two');

        createRoomScope(shared).meta.setAttr('template', valid as never);
        await vi.waitFor(() => expect(session.reloads.get()?.reason).toBe('conflict'));
        stalled.resolve(missing);
        await stalled.promise;
        await Promise.resolve();
        expect(session.document.get()).toMatchObject({ pin: valid, editingMode: 'edit' });
        expect(session.status.get().error).toBeNull();
        expect(textOf(stateOf(session))).toBe('Replacement');
        expect(notice).toHaveBeenCalledTimes(1);
      } finally {
        stalled.resolve(missing);
        session.close();
        shared.destroy();
      }
    },
  );

  it.each([false, true])(
    'DOCE-SESSION-3.11 keeps the caret or backward selection in moved text on reload (range %s)',
    async (range) => {
      rooms = createSessionRooms({ documents: [{ id: 'doc', content: DOCUMENT }] });
      const { adapter, reload } = replaceable(rooms);
      const session = createDocumentSession({
        host: { ...createMemoryHost(), collaboration: adapter },
        documentId: 'doc',
        mode: 'room',
      });
      sessions.push(session);
      expect(await session.ready).toBe(true);
      session.update((state) => {
        const head = positionOf(state.doc, 'One') + 1;
        const anchor = range ? positionOf(state.doc, 'Two') + 2 : head;
        return state.apply(state.tr.setSelection(TextSelection.create(state.doc, anchor, head)));
      });
      const shared = new Y.Doc();
      Y.applyUpdate(
        shared,
        documentToYjs(
          {
            ...DOCUMENT,
            sections: [
              {
                content: [
                  paragraph('a0000010', 'An unrelated paragraph before the selected text'),
                  paragraph('a0000004', 'Before One'),
                  paragraph('a0000006', 'Two'),
                ],
              },
            ],
          },
          { schema: documentSchema },
        ),
      );
      try {
        reload(shared);
        const { doc, selection } = stateOf(session);
        const head = positionOf(doc, 'One') + 1;
        const anchor = range ? positionOf(doc, 'Two') + 2 : head;
        expect([selection.anchor, selection.head]).toEqual([anchor, head]);
      } finally {
        session.close();
        shared.destroy();
      }
    },
  );

  it('DOCE-SESSION-3.11 keeps the caret in unique surviving text without an element id', async () => {
    const anonymous = { type: 'paragraph', content: [{ type: 'text', text: 'Anonymous' }] };
    const original = { ...DOCUMENT, sections: [{ content: [anonymous] }] };
    rooms = createSessionRooms({ documents: [{ id: 'doc', content: original }] });
    const { adapter, reload } = replaceable(rooms);
    const session = createDocumentSession({
      host: { ...createMemoryHost(), collaboration: adapter },
      documentId: 'doc',
      mode: 'room',
    });
    sessions.push(session);
    expect(await session.ready).toBe(true);
    const previous = new Y.Doc();
    const shared = new Y.Doc();
    const inserted = paragraph('a0000010', 'An unrelated paragraph before the selected text');
    // Write an older room directly, before the stored-file conversion assigned missing IDs.
    writeContent(createRoomScope(previous).content, readDocumentFile(original, documentSchema).doc);
    const replacement = { ...original, sections: [{ content: [inserted, anonymous] }] };
    writeContent(
      createRoomScope(shared).content,
      readDocumentFile(replacement, documentSchema).doc,
    );
    try {
      reload(previous);
      session.update((state) => {
        const caret = positionOf(state.doc, 'Anonymous') + 4;
        return state.apply(state.tr.setSelection(TextSelection.create(state.doc, caret)));
      });
      expect(stateOf(session).selection.$head.parent.attrs.dataId).toBeNull();
      reload(shared);
      const { doc, selection } = stateOf(session);
      expect(selection.head).toBe(positionOf(doc, 'Anonymous') + 4);
    } finally {
      session.close();
      previous.destroy();
      shared.destroy();
    }
  });

  it('DOCE-SESSION-3.11 keeps a newer reload locked when a reader starts it during publication', async () => {
    rooms = createSessionRooms({ documents: [{ id: 'doc', content: DOCUMENT }] });
    const { adapter, reload } = replaceable(rooms);
    const pin = { id: 'letter', revision: 'rev-1' };
    const host = createMemoryHost({ templates: [{ formatVersion: 1, id: pin.id }] });
    const load = host.templates.load.bind(host.templates);
    const finish = deferred<void>();
    host.templates.load = async (...args) => {
      if (args[0] === pin.id) await finish.promise;
      return load(...args);
    };
    const notice = vi.fn();
    const session = createDocumentSession({
      host: { ...host, collaboration: adapter },
      documentId: 'doc',
      mode: 'room',
      onRoomReload: notice,
    });
    sessions.push(session);
    expect(await session.ready).toBe(true);
    const first = new Y.Doc();
    const second = new Y.Doc();
    for (const [doc, text, template] of [
      [first, 'First replacement', null],
      [second, 'Second replacement', pin],
    ] as const) {
      const content = {
        ...DOCUMENT,
        template,
        sections: [{ content: [paragraph('a0000001', text)] }],
      };
      Y.applyUpdate(doc, documentToYjs(content, { schema: documentSchema }));
    }
    const stop = session.document.subscribe((shown) => {
      if (shown?.state.doc.textContent !== 'First replacement') return;
      stop();
      reload(second);
    });
    try {
      reload(first);
      expect(session.connection.get()?.gate).toEqual({ editable: false, locked: true });
      expect(session.document.get()?.editingMode).toBe('read');
      expect(session.reloads.get()).toBeNull();
      expect(notice).not.toHaveBeenCalled();
      finish.resolve(undefined);
      await vi.waitFor(() => expect(session.reloads.get()?.reason).toBe('conflict'));
      expect(textOf(stateOf(session))).toBe('Second replacement');
      expect(session.document.get()).toMatchObject({ pin, editingMode: 'edit' });
      expect(notice).toHaveBeenCalledTimes(1);
    } finally {
      stop();
      finish.resolve(undefined);
      session.close();
      first.destroy();
      second.destroy();
    }
  });

  it('DOCE-SESSION-1.4 DOCE-SESSION-3.11 keeps capability changes during replacement state creation', async () => {
    rooms = createSessionRooms({ documents: [{ id: 'doc', content: DOCUMENT }] });
    const { adapter, reload } = replaceable(rooms);
    const host = createMemoryHost();
    const session = createDocumentSession({
      host: { ...host, collaboration: adapter },
      documentId: 'doc',
      mode: 'room',
      createState(doc, { room }) {
        if (doc.textContent === 'Replacement') host.memory.setCapabilities(READ_ONLY_CAPABILITIES);
        return EditorState.create({ doc, plugins: room?.plugins ?? [] });
      },
    });
    sessions.push(session);
    expect(await session.ready).toBe(true);
    expect(session.document.get()?.editingMode).toBe('edit');
    const shared = new Y.Doc();
    const content = {
      ...DOCUMENT,
      sections: [{ content: [paragraph('a0000001', 'Replacement')] }],
    };
    Y.applyUpdate(shared, documentToYjs(content, { schema: documentSchema }));
    try {
      reload(shared);
      expect(session.document.get()?.editingMode).toBe('read');
      expect(textOf(stateOf(session))).toBe('Replacement');
    } finally {
      session.close();
      shared.destroy();
    }
  });

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
