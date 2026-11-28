import * as Y from '@y/y';
import type { Node } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type HeadlessEditor, headlessEditor, readFixture } from '../../test/collab-fixtures.js';
import { createPresence, listPeers } from '../engine/presence.js';
import { suggestionsKey } from '../engine/suggestions.js';
import type { DocumentFile } from '../model/index.js';
import {
  type AwarenessChanges,
  type AwarenessPresenceOptions,
  createAwarenessPresence,
  type PresenceAwareness,
} from './awareness.js';
import type * as Activity from './presence-activity.js';

// Counts the test's own events as the reader's and, unless a test says otherwise, takes the reader
// as placed in the content from the start.
const reader = vi.hoisted(() => ({ placed: true }));

vi.mock('./presence-activity.js', async (importOriginal) => {
  const actual = await importOriginal<typeof Activity>();
  return {
    ...actual,
    followReader: (...[view, gate, handlers]: Parameters<typeof actual.followReader>) => {
      if (reader.placed) gate.placed = true;
      return actual.followReader(view, gate, { ...handlers, isReader: () => true });
    },
  };
});

const FILE: DocumentFile = {
  formatVersion: 1,
  sections: [
    {
      name: null,
      content: [
        {
          type: 'paragraph',
          attrs: { id: 'a0000001' },
          content: [{ type: 'text', text: 'The same word in both editors.' }],
        },
      ],
    },
  ],
};

type Listener = (changes: AwarenessChanges, origin: unknown) => void;

// Awarenesses that share their states at once, as a room relays them.
function awarenessRoom() {
  const states = new Map<number, Record<string, unknown>>();
  const listeners = new Set<Listener>();
  const notify = (clientID: number) => {
    for (const listener of [...listeners]) {
      listener({ added: [], updated: [clientID], removed: [] }, 'local');
    }
  };
  return {
    join(clientID: number): PresenceAwareness & { leave(): void } {
      const own = new Set<Listener>();
      return {
        clientID,
        getStates: () => states,
        setLocalStateField(field, value) {
          states.set(clientID, { ...(states.get(clientID) ?? {}), [field]: value });
          notify(clientID);
        },
        on(_event, listener) {
          own.add(listener);
          listeners.add(listener);
        },
        off(_event, listener) {
          own.delete(listener);
          listeners.delete(listener);
        },
        leave() {
          states.delete(clientID);
          for (const listener of [...listeners]) {
            listener({ added: [], updated: [], removed: [clientID] }, 'local');
          }
        },
      };
    },
  };
}

const settle = () => new Promise<void>((resolve) => queueMicrotask(resolve));

const editors: HeadlessEditor[] = [];

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});

function joinEditor(
  doc: Y.Doc,
  awareness: PresenceAwareness,
  user: AwarenessPresenceOptions['user'],
  options: Partial<AwarenessPresenceOptions> = {},
): HeadlessEditor {
  const editor = headlessEditor(readFixture(FILE), {
    doc,
    plugins: [createPresence(), createAwarenessPresence({ awareness, user, ...options })],
  });
  editors.push(editor);
  return editor;
}

/** Two editors on one shared document, through Yjs updates and a shared awareness. */
async function pair(options: Partial<AwarenessPresenceOptions> = {}) {
  const room = awarenessRoom();
  const docA = new Y.Doc();
  const docB = new Y.Doc();
  const sync = () => {
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA, Y.encodeStateVector(docB)), 'network');
    Y.applyUpdate(docA, Y.encodeStateAsUpdate(docB, Y.encodeStateVector(docA)), 'network');
  };
  const awarenessA = room.join(1);
  const awarenessB = room.join(2);
  const a = joinEditor(docA, awarenessA, { id: 'ada', name: 'Ada' }, options);
  sync();
  const b = joinEditor(docB, awarenessB, { id: 'grace', name: 'Grace', color: '#c00' }, options);
  await settle();
  sync();
  await settle();
  return { a, b, sync, awarenessA, awarenessB };
}

const wordAt = (doc: Node, word: string): number => {
  let found = -1;
  doc.descendants((node, pos) => {
    const index = node.isText ? (node.text ?? '').indexOf(word) : -1;
    if (found < 0 && index >= 0) found = pos + index;
  });
  return found;
};

const select = (editor: HeadlessEditor, from: number, to = from) => {
  editor.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, from, to)));
};

describe('awareness presence', () => {
  it('DOCE-COLLAB-1.5 shows each person’s selection to the others by relative position', async () => {
    const { a, b } = await pair();
    const word = wordAt(a.state.doc, 'word');
    select(a, word, word + 4);
    await settle();
    const [ada] = listPeers(b.state);
    expect(ada).toMatchObject({ id: 'ada', name: 'Ada', anchor: word, head: word + 4 });
    expect(listPeers(a.state)).toMatchObject([{ id: 'grace', name: 'Grace', color: '#c00' }]);
  });

  it('DOCE-COLLAB-1.5 publishes the first writer’s caret once their document fills the room', async () => {
    const awareness = awarenessRoom().join(1);
    joinEditor(new Y.Doc(), awareness, { id: 'ada', name: 'Ada' });
    await settle();
    expect(awareness.getStates().get(1)?.cursor).toMatchObject({ head: expect.anything() });
  });

  it('DOCE-COLLAB-1.5 takes from another person only a plain colour and a picture’s address', async () => {
    const { a, awarenessB } = await pair();
    const publish = async (user: Record<string, unknown>) => {
      awarenessB.setLocalStateField('user', { id: 'grace', name: 'Grace', ...user });
      await settle();
      return listPeers(a.state)[0];
    };
    const forged = await publish({
      color: 'red; position: fixed; inset: 0',
      avatar: 'javascript:void(0)',
    });
    expect(forged).toMatchObject({ id: 'grace', name: 'Grace' });
    expect(forged).not.toHaveProperty('color');
    expect(forged).not.toHaveProperty('avatar');
    expect(
      await publish({ color: 'hsl(210 50% 40%)', avatar: 'https://example.invalid/grace.png' }),
    ).toMatchObject({ color: 'hsl(210 50% 40%)', avatar: 'https://example.invalid/grace.png' });
    expect(await publish({ avatar: 'data:image/png;base64,AAAA' })).toMatchObject({
      avatar: 'data:image/png;base64,AAAA',
    });
  });

  it('DOCE-COLLAB-1.5 keeps a person’s caret on the same text while another edits before it', async () => {
    const { a, b, sync } = await pair();
    select(a, wordAt(a.state.doc, 'word'));
    await settle();
    b.dispatch(b.state.tr.insertText('Typed first. ', 1));
    sync();
    await settle();
    await settle();
    const head = listPeers(b.state)[0]?.head ?? -1;
    expect(b.state.doc.textBetween(head, head + 4)).toBe('word');
    expect(a.state.doc.textBetween(head, head + 4)).toBe('word');
  });

  it('DOCE-COLLAB-1.5 lists a person who left no more', async () => {
    const { b, awarenessA } = await pair();
    expect(listPeers(b.state)).toHaveLength(1);
    (awarenessA as PresenceAwareness & { leave(): void }).leave();
    await settle();
    expect(listPeers(b.state)).toEqual([]);
  });

  it('DOCE-COLLAB-1.5 shares no presence from a second view of the document', () => {
    let lifecycle: ((event: 'hidden' | 'visible' | 'leaving') => void) | null = null;
    const awareness = awarenessRoom().join(1);
    const editor = joinEditor(
      new Y.Doc(),
      awareness,
      { id: 'ada', name: 'Ada' },
      {
        lifecycle: {
          subscribe(onEvent) {
            lifecycle ??= onEvent;
            return () => undefined;
          },
        },
      },
    );
    select(editor, 4);
    const shared = () => awareness.getStates().get(1) ?? {};
    expect(shared().cursor).toBeTruthy();
    // A second view of the document, with every plugin of the state whose spec does not say
    // `measured: false`, as the paged layout's state holds them.
    const plugins = editor.state.plugins.filter((plugin) => plugin.spec.measured !== false);
    const measuring = new EditorView(document.createElement('div'), {
      state: EditorState.create({ doc: editor.state.doc, plugins }),
    });
    expect(shared().cursor).toBeTruthy();
    (lifecycle as ((event: 'hidden') => void) | null)?.('hidden');
    // It follows a collaborator's change with a change of its own, which is no input of the reader.
    measuring.dispatch(measuring.state.tr.insertText('Remote ', 2));
    expect(shared().status).toBe('away');
    measuring.destroy();
    expect(shared().cursor).toBeTruthy();
  });

  it('DOCE-COLLAB-1.6 marks a person idle without input and away while their page is hidden', async () => {
    vi.useFakeTimers();
    try {
      let lifecycle: ((event: 'hidden' | 'visible' | 'leaving') => void) | null = null;
      const { a, b } = await pair({
        idleAfter: 1000,
        lifecycle: {
          subscribe(onEvent) {
            lifecycle ??= onEvent;
            return () => undefined;
          },
        },
      });
      vi.advanceTimersByTime(1500);
      await settle();
      expect(listPeers(b.state)[0]?.status).toBe('idle');
      select(a, 3);
      await settle();
      expect(listPeers(b.state)[0]?.status).toBe('active');
      (lifecycle as ((event: 'hidden') => void) | null)?.('hidden');
      await settle();
      expect(listPeers(b.state)[0]?.status).toBe('away');
    } finally {
      vi.useRealTimers();
    }
  });

  it('DOCE-COLLAB-1.5 takes from another person only an email of one line', async () => {
    const { a, awarenessB } = await pair();
    const publish = async (email: string) => {
      awarenessB.setLocalStateField('user', { id: 'grace', name: 'Grace', email });
      await settle();
      return listPeers(a.state)[0];
    };
    expect(await publish('grace@example.com')).toMatchObject({ email: 'grace@example.com' });
    expect(await publish('grace@example.com\nforged')).not.toHaveProperty('email');
    expect(await publish('not an email')).not.toHaveProperty('email');
  });

  it('DOCE-COLLAB-1.6 shares what each person did last: viewing, editing or reviewing', async () => {
    const { a, b, sync } = await pair();
    const activityOfAda = async () => {
      await settle();
      sync();
      await settle();
      return listPeers(b.state)[0]?.activity;
    };
    expect(await activityOfAda()).toBe('viewing');
    a.dispatch(a.state.tr.insertText('New ', 3));
    expect(await activityOfAda()).toBe('editing');
    select(a, 5);
    expect(await activityOfAda()).toBe('viewing');
    a.dispatch(a.state.tr.insertText('x', 5).setMeta(suggestionsKey, 'suggest'));
    expect(await activityOfAda()).toBe('reviewing');
    select(a, 5);
    const comment = a.state.schema.marks.comment_highlight?.create({ commentId: 'c1' });
    if (!comment) throw new Error('The schema has no comment anchors.');
    a.dispatch(a.state.tr.addMark(3, 8, comment));
    expect(await activityOfAda()).toBe('reviewing');
    // Another person's change is no activity of the reader's.
    b.dispatch(b.state.tr.insertText('Grace ', 3));
    expect(await activityOfAda()).toBe('reviewing');
    expect(listPeers(a.state)[0]?.activity).toBe('editing');
  });

  it('DOCE-COLLAB-1.6 makes an idle person active when they scroll the editor by wheel', async () => {
    vi.useFakeTimers();
    try {
      const { a, b } = await pair({ idleAfter: 1000 });
      document.body.append(a.view.dom);
      vi.advanceTimersByTime(1500);
      await settle();
      expect(listPeers(b.state)[0]?.status).toBe('idle');
      const elsewhere = document.body.appendChild(document.createElement('aside'));
      elsewhere.dispatchEvent(new WheelEvent('wheel', { bubbles: true }));
      elsewhere.remove();
      await settle();
      expect(listPeers(b.state)[0]?.status).toBe('idle');
      a.view.dom.dispatchEvent(new WheelEvent('wheel', { bubbles: true }));
      await settle();
      expect(listPeers(b.state)[0]).toMatchObject({ status: 'active', activity: 'viewing' });
      a.view.dom.remove();
    } finally {
      vi.useRealTimers();
    }
  });

  it('DOCE-COLLAB-1.5 shares no caret until the reader points, selects or types in the content, and keeps it after', async () => {
    reader.placed = false;
    try {
      const { a, b } = await pair();
      const ada = () => listPeers(b.state).find((peer) => peer.id === 'ada');
      select(a, 5);
      await settle();
      expect(ada()).toMatchObject({ id: 'ada', head: null });
      a.view.dom.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      await vi.waitFor(() => expect(ada()?.head).toBe(5));
      // A layout switch makes a new view of the same state: the reader stays placed.
      const state = a.state;
      a.destroy();
      const next = new EditorView(document.createElement('div'), { state });
      await vi.waitFor(() => expect(ada()?.head).toBe(5));
      next.destroy();
    } finally {
      reader.placed = true;
    }
  });
});

it('DOCE-COLLAB-7.1 keeps field cursors and disposal independent in one awareness', async () => {
  const { createRoomScope } = await import('./room-scope.js');
  const room = awarenessRoom();
  const shared = new Y.Doc();
  const awareness = room.join(1);
  const first = createRoomScope(shared, 'first');
  const second = createRoomScope(shared, 'second');
  const user = { id: 'writer', name: 'Writer' };
  const a = headlessEditor(readFixture(FILE), {
    doc: shared,
    scope: first,
    plugins: [
      createPresence(),
      createAwarenessPresence({ awareness, user, field: first.presence }),
    ],
  });
  const b = headlessEditor(readFixture(FILE), {
    doc: shared,
    scope: second,
    plugins: [
      createPresence(),
      createAwarenessPresence({ awareness, user, field: second.presence }),
    ],
  });
  editors.push(a, b);
  await settle();
  const before = awareness.getStates().get(1)?.[second.presence];
  a.dispatch(
    a.state.tr.setSelection(TextSelection.create(a.state.doc, wordAt(a.state.doc, 'same'))),
  );
  expect(awareness.getStates().get(1)?.[second.presence]).toEqual(before);
  expect(awareness.getStates().get(1)?.[first.presence]).not.toEqual(before);
  a.destroy();
  expect(awareness.getStates().get(1)?.[first.presence]).toBeNull();
  expect(awareness.getStates().get(1)?.[second.presence]).toEqual(before);
  shared.destroy();
});

it('DOCE-COLLAB-7.1 uses authoritative room actor identity for scoped awareness', async () => {
  const { a, awarenessB } = await pair({ field: 'field-presence' });
  awarenessB.setLocalStateField('actor', { id: 'authenticated', name: 'Authenticated' });
  awarenessB.setLocalStateField('field-presence', {
    user: { id: 'forged', name: 'Forged' },
    cursor: null,
  });
  await settle();
  expect(listPeers(a.state)).toEqual([
    expect.objectContaining({ id: 'authenticated', name: 'Authenticated' }),
  ]);
  awarenessB.setLocalStateField('actor', { id: 'authenticated' });
  await settle();
  expect(listPeers(a.state)).toEqual([
    expect.objectContaining({ id: 'authenticated', name: 'authenticated' }),
  ]);
});
