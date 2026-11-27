// Two writers in a room who each add a variable at once: the room keeps the document's variable
// texts one shared attribute per key, so both writers' texts stay (DOCE-PAGINATION-8.8,
// DOCE-COLLAB-6.9), and each writer's undo takes back only the keys their own change set. The
// refill is the editor's, as its `useDocumentValues` runs it: whenever the stored texts change, the
// texts of the keys the document shows and stores none for.

import type * as Y from '@y/y';
import { Plugin, type PluginView } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import {
  createRelayRoom,
  type HeadlessEditor,
  headlessEditor,
  readFixture,
  sharedDocument,
  undoManagerOf,
} from '../../test/collab-fixtures.js';
import { createDocumentValues, refreshDocumentValues } from '../engine/index.js';
import type { DocumentFile } from '../model/index.js';

const TEXTS: Readonly<Record<string, string>> = {
  'document.name': 'Interface notes',
  'document.owner': 'Ada',
};
const source = { value: (key: string) => TEXTS[key] };

const FILE: DocumentFile = {
  formatVersion: 1,
  sections: [
    {
      name: null,
      content: [
        { type: 'paragraph', attrs: { id: 'a0000001' }, content: [{ type: 'text', text: 'One' }] },
        { type: 'paragraph', attrs: { id: 'a0000002' }, content: [{ type: 'text', text: 'Two' }] },
      ],
    },
  ],
};

// The editor's refill, as `useDocumentValues` runs it after each change of the stored texts.
const refill = () =>
  new Plugin({
    view: (): PluginView => ({
      update: (view, previous) => {
        if (view.state.doc.attrs.values === previous.doc.attrs.values) return;
        queueMicrotask(() =>
          refreshDocumentValues(source, 'missing')(view.state, (tr) =>
            view.dispatch(tr.setMeta('addToHistory', false)),
          ),
        );
      },
    }),
  });

const settle = async () => {
  for (let round = 0; round < 3; round += 1) await new Promise((done) => setImmediate(done));
};

// Inserts a variable at the end of a paragraph, as a writer does from the menu.
function insertVariable(editor: HeadlessEditor, text: string, key: string): void {
  const { doc, schema } = editor.state;
  let at = -1;
  doc.descendants((node, pos) => {
    if (node.isTextblock && node.textContent === text) at = pos + node.nodeSize - 1;
    return at < 0;
  });
  const variable = schema.nodes.template_variable?.create({ variableKey: key });
  if (!variable || at < 0) throw new Error('No place for the variable.');
  editor.dispatch(editor.state.tr.insert(at, variable));
}

const countUpdates = (doc: Y.Doc) => {
  const counted = { updates: 0 };
  doc.on('update', () => (counted.updates += 1));
  return counted;
};

describe('variable texts in a room', () => {
  it('DOCE-PAGINATION-8.8 DOCE-COLLAB-4.1 keeps both texts when two writers add variables at once, in a bounded number of updates', async () => {
    const first = headlessEditor(readFixture(FILE));
    const relay = createRelayRoom(first.doc);
    const start = sharedDocument(relay.room);
    first.destroy();
    if (!start) throw new Error('The room holds no document.');
    const join = (clientID: number) =>
      headlessEditor(start, {
        doc: relay.join(clientID),
        plugins: [createDocumentValues(() => source), refill()],
      });
    const [ada, grace] = [join(1), join(2)];
    const room = countUpdates(relay.room);
    // Neither sees the other's change before making their own.
    insertVariable(ada, 'One', 'document.name');
    insertVariable(grace, 'Two', 'document.owner');
    expect(ada.state.doc.attrs.values).toEqual({ 'document.name': 'Interface notes' });
    expect(grace.state.doc.attrs.values).toEqual({ 'document.owner': 'Ada' });
    for (let pass = 0; pass < 6; pass += 1) {
      relay.deliver(() => Infinity);
      await settle();
    }
    for (const editor of [ada, grace]) {
      expect(editor.state.doc.attrs.values).toEqual(TEXTS);
      expect(sharedDocument(editor.doc)?.toJSON()).toEqual(editor.state.doc.toJSON());
    }
    expect(sharedDocument(relay.room)?.attrs.values).toEqual(TEXTS);
    // The two insertions, each with its own key's text: neither writer has a text to refill.
    expect(room.updates).toBe(2);
    const settled = room.updates;
    for (let pass = 0; pass < 3; pass += 1) {
      relay.deliver(() => Infinity);
      await settle();
    }
    expect(room.updates).toBe(settled);
  });
});

const STORED = { 'document.name': 'Plan', other: 'Kept' };

// A room whose document stores STORED, and two writers in it with the given client ids, each with
// their own undo.
function storedRoom(ids: readonly [number, number], plugins: () => Plugin[] = () => []) {
  const first = headlessEditor(readFixture(FILE));
  first.dispatch(first.state.tr.setDocAttribute('values', STORED));
  const relay = createRelayRoom(first.doc);
  const start = sharedDocument(relay.room);
  first.destroy();
  if (!start) throw new Error('The room holds no document.');
  const [ada, grace] = ids.map((id) =>
    headlessEditor(start, { doc: relay.join(id), plugins: plugins() }),
  );
  if (!ada || !grace) throw new Error('No writers.');
  const deliver = async () => {
    for (let pass = 0; pass < 3; pass += 1) {
      relay.deliver(() => Infinity);
      await settle();
    }
  };
  return { relay, ada, grace, deliver, undo: [undoManagerOf(ada), undoManagerOf(grace)] as const };
}

const setName = (editor: HeadlessEditor, name: string) =>
  editor.dispatch(
    editor.state.tr.setDocAttribute('values', {
      ...editor.state.doc.attrs.values,
      'document.name': name,
    }),
  );

describe('undo of variable texts in a room', () => {
  for (const ids of [
    [1, 2],
    [2, 1],
  ] as const) {
    it(`DOCE-COLLAB-6.9 DOCE-COLLAB-6.3 keeps the keys an undo did not touch when two writers set one text at once (client ids ${ids.join(', ')})`, async () => {
      const { relay, ada, grace, deliver, undo } = storedRoom(ids);
      // Neither sees the other's change before making their own.
      setName(ada, 'Notes');
      setName(grace, 'Minutes');
      await deliver();
      const kept = sharedDocument(relay.room)?.attrs.values as Record<string, string>;
      expect(['Notes', 'Minutes']).toContain(kept['document.name']);
      expect(kept.other).toBe('Kept');
      const winner = kept['document.name'] === 'Notes' ? 0 : 1;
      undo[winner].undo();
      await deliver();
      // Yjs never brings back a text another writer's change replaced, so the name the undo took
      // back stores none, for the editor to refill; every other text stays.
      for (const values of [ada, grace].map((editor) => editor.state.doc.attrs.values))
        expect(values).toEqual({ other: 'Kept' });
      expect(sharedDocument(relay.room)?.attrs.values).toEqual({ other: 'Kept' });
    });
  }

  it('DOCE-COLLAB-6.9 DOCE-PAGINATION-8.8 refills the text an undo took back from the host', async () => {
    const { relay, ada, grace, deliver, undo } = storedRoom([1, 2], () => [
      createDocumentValues(() => source),
      refill(),
    ]);
    insertVariable(ada, 'One', 'document.name');
    await deliver();
    setName(ada, 'Notes');
    setName(grace, 'Minutes');
    await deliver();
    const winner = sharedDocument(relay.room)?.attrs.values['document.name'] === 'Notes' ? 0 : 1;
    undo[winner].undo();
    await deliver();
    const expected = { 'document.name': 'Interface notes', other: 'Kept' };
    for (const editor of [ada, grace]) expect(editor.state.doc.attrs.values).toEqual(expected);
    expect(sharedDocument(relay.room)?.attrs.values).toEqual(expected);
  });

  it("DOCE-COLLAB-6.9 DOCE-COLLAB-6.3 undoes and redoes one writer's text alone while another writer sets another", async () => {
    const { relay, ada, grace, deliver, undo } = storedRoom([1, 2]);
    setName(ada, 'Notes');
    grace.dispatch(
      grace.state.tr.setDocAttribute('values', {
        ...grace.state.doc.attrs.values,
        other: 'Changed',
      }),
    );
    await deliver();
    expect(sharedDocument(relay.room)?.attrs.values).toEqual({
      'document.name': 'Notes',
      other: 'Changed',
    });
    undo[0].undo();
    await deliver();
    for (const editor of [ada, grace])
      expect(editor.state.doc.attrs.values).toEqual({ 'document.name': 'Plan', other: 'Changed' });
    undo[0].redo();
    await deliver();
    expect(sharedDocument(relay.room)?.attrs.values).toEqual({
      'document.name': 'Notes',
      other: 'Changed',
    });
    expect(grace.state.doc.attrs.values).toEqual({ 'document.name': 'Notes', other: 'Changed' });
  });

  it('DOCE-COLLAB-6.9 keeps each text as one shared attribute of the content type', () => {
    const { relay } = storedRoom([1, 2]);
    const content = relay.room.get('content');
    expect(content.getAttr('values')).toBeUndefined();
    expect(content.getAttr('values.document.name')).toBe('Plan');
    expect(content.getAttr('values.other')).toBe('Kept');
  });

  it('DOCE-COLLAB-6.9 reads back any key, one named as an object property too', async () => {
    const { relay, ada, grace, deliver } = storedRoom([1, 2]);
    const values = JSON.parse('{"__proto__":"Odd","constructor":"Also","a.b":"Dotted"}') as Record<
      string,
      string
    >;
    ada.dispatch(ada.state.tr.setDocAttribute('values', values));
    await deliver();
    for (const held of [sharedDocument(relay.room), grace.state.doc]) {
      expect(Object.entries(held?.attrs.values as object)).toEqual(Object.entries(values));
    }
  });

  it('DOCE-COLLAB-6.9 reads and replays the texts held whole as nothing, in an open editor and a fresh read alike', async () => {
    const { relay, ada, grace, deliver } = storedRoom([1, 2]);
    ada.doc.get('content').setAttr('values', { 'document.name': 'Whole' });
    await deliver();
    for (const held of [sharedDocument(relay.room), ada.state.doc, grace.state.doc])
      expect(held?.attrs.values).toEqual(STORED);
  });
});
