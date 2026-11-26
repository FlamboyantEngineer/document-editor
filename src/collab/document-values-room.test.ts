// Two writers in a room who each add a variable at once: the document's variable texts are one
// attribute of its top node, so the room keeps one writer's record, and the other writer's editor
// stores the text it lost again (DOCE-PAGINATION-8.8). The refill is the editor's, as its
// `useDocumentValues` runs it: whenever the stored texts change, the texts of the keys the document
// shows and stores none for.

import type * as Y from '@y/y';
import { Plugin, type PluginView } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import {
  createRelayRoom,
  type HeadlessEditor,
  headlessEditor,
  readFixture,
  sharedDocument,
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
    // The two insertions, and one refill by the writer whose record the room did not keep.
    expect(room.updates).toBe(3);
    const settled = room.updates;
    for (let pass = 0; pass < 3; pass += 1) {
      relay.deliver(() => Infinity);
      await settle();
    }
    expect(room.updates).toBe(settled);
  });
});
