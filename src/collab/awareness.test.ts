import * as Y from '@y/y';
import type { Node } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type HeadlessEditor, headlessEditor, readFixture } from '../../test/collab-fixtures.js';
import { createPresence, listPeers } from '../engine/presence.js';
import type { DocumentFile } from '../model/index.js';
import {
  type AwarenessChanges,
  type AwarenessPresenceOptions,
  createAwarenessPresence,
  type PresenceAwareness,
} from './awareness.js';

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

  it('DOCE-COLLAB-1.5 shares no presence from the paged layout’s measuring view', () => {
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
    // The measuring view is a second view of the document, with every plugin of the state whose
    // spec does not say `measured: false`.
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
});
