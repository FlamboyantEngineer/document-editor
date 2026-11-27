// Template blocks in a room (DOCE-TEMPLATES-9.1): what a block renders is stored in the shared
// document, so every editor that edits directly renders it after any change to the stored texts,
// its own or not, wherever a block holds anything else. Two writers who render at once each insert
// the same blocks, which the room keeps both of; an editor that then finds a block holding what it
// renders whole beside other blocks only deletes the others, so every editor deletes the same ones
// and the room settles on one copy.

import type * as Y from '@y/y';
import { history, undo } from 'prosemirror-history';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { describe, expect, it } from 'vitest';
import {
  createRelayRoom,
  type HeadlessEditor,
  headlessEditor,
  readFixture,
  sharedDocument,
} from '../../test/collab-fixtures.js';
import { documentSchema } from '../../test/document-markup.js';
import { createDynamicTemplates } from '../engine/dynamic-templates.js';
import { createElementIds } from '../engine/element-ids.js';
import type { DocumentFile } from '../model/index.js';
import { updateRoomDocument } from './convert.js';

const FILE: DocumentFile = {
  formatVersion: 1,
  values: { 'document.name': 'Plan' },
  sections: [
    {
      name: null,
      content: [
        {
          type: 'templateBlock',
          attrs: { id: 'b0000001', source: '<p>{{document.name}}</p>' },
          content: [
            {
              type: 'paragraph',
              attrs: { id: '1d6a2c14', author: 'owner' },
              content: [{ type: 'text', text: 'Plan' }],
            },
          ],
        },
        { type: 'paragraph', attrs: { id: 'a0000002' }, content: [{ type: 'text', text: 'Two' }] },
      ],
    },
  ],
};

const settle = async () => {
  for (let round = 0; round < 3; round += 1) await new Promise((done) => setImmediate(done));
};

// What the document's template block holds, as its paragraphs' texts.
function shown(doc: ProseMirrorNode | null) {
  const texts: string[] = [];
  doc?.descendants((node) => {
    if (node.type.name !== 'dynamic_template') return true;
    node.forEach((child) => texts.push(child.textContent));
    return false;
  });
  return texts;
}

const countUpdates = (doc: Y.Doc) => {
  const counted = { updates: 0 };
  doc.on('update', () => (counted.updates += 1));
  return counted;
};

function roomOf() {
  const first = headlessEditor(readFixture(FILE));
  const relay = createRelayRoom(first.doc);
  const start = sharedDocument(relay.room);
  first.destroy();
  if (!start) throw new Error('The room holds no document.');
  const join = (clientID: number, author: string, enabled = true) =>
    headlessEditor(start, {
      doc: relay.join(clientID),
      plugins: [
        history(),
        createDynamicTemplates({ enabled: () => enabled }),
        createElementIds({ author: () => author }),
      ],
    });
  const deliver = async (passes = 6) => {
    for (let pass = 0; pass < passes; pass += 1) {
      relay.deliver(() => Infinity);
      await settle();
    }
  };
  return { relay, join, deliver };
}

const setName = (editor: HeadlessEditor, name: string) =>
  editor.dispatch(editor.state.tr.setDocAttribute('values', { 'document.name': name }));

describe('template blocks in a room', () => {
  it.each([
    ['the same text', 'Notes', 'Notes'],
    ['different texts', 'Notes', 'Minutes'],
  ])(
    'DOCE-TEMPLATES-9.1 DOCE-COLLAB-4.1 ends with one copy when two writers render at once with %s',
    async (_name, first, second) => {
      const { relay, join, deliver } = roomOf();
      const [ada, grace] = [join(1, 'ada'), join(2, 'grace')];
      const reader = join(3, 'reader', false);
      const room = countUpdates(relay.room);
      // Neither sees the other's change before making their own, and each renders.
      setName(ada, first);
      setName(grace, second);
      expect(shown(ada.state.doc)).toEqual([first]);
      expect(shown(grace.state.doc)).toEqual([second]);
      await deliver();
      const kept = String(
        (sharedDocument(relay.room)?.attrs.values as Record<string, string>)['document.name'],
      );
      for (const editor of [ada, grace, reader]) {
        expect(shown(editor.state.doc)).toEqual([kept]);
        expect(sharedDocument(editor.doc)?.toJSON()).toEqual(editor.state.doc.toJSON());
      }
      expect(shown(sharedDocument(relay.room))).toEqual([kept]);
      // The rendered paragraph is no writer's: no author, and its text no contributor's.
      let rendered: ProseMirrorNode | null | undefined;
      reader.state.doc.descendants((node) => {
        if (node.type.name === 'dynamic_template') rendered = node.firstChild;
        return rendered === undefined;
      });
      expect(rendered?.attrs.dataAuthor).toBeNull();
      expect(rendered?.firstChild?.marks).toEqual([]);
      // Settled: nothing more is sent.
      const settled = room.updates;
      await deliver(3);
      expect(room.updates).toBe(settled);
    },
  );

  it('DOCE-TEMPLATES-9.1 renders after a server write and a replayed change, which render nothing themselves', async () => {
    const { relay, join, deliver } = roomOf();
    const ada = join(1, 'ada');
    const reader = join(3, 'reader', false);
    // The server stores a new text and leaves the block as it was.
    updateRoomDocument(
      relay.room,
      { ...FILE, values: { 'document.name': 'Budget' } },
      { schema: documentSchema },
    );
    await deliver();
    for (const editor of [ada, reader]) expect(shown(editor.state.doc)).toEqual(['Budget']);
    expect(shown(sharedDocument(relay.room))).toEqual(['Budget']);
    // A writer who was offline replays a change of the text made without rendering.
    const replay = join(4, 'grace', false);
    await deliver();
    setName(replay, 'Agenda');
    expect(shown(replay.state.doc)).toEqual(['Budget']);
    await deliver();
    for (const editor of [ada, reader, replay]) expect(shown(editor.state.doc)).toEqual(['Agenda']);
  });

  it('DOCE-TEMPLATES-9.1 undoes a change of the texts with its render, and sends nothing for a refused edit inside a block', async () => {
    const { relay, join, deliver } = roomOf();
    const ada = join(1, 'ada');
    const reader = join(3, 'reader', false);
    setName(ada, 'Notes');
    await deliver();
    expect(shown(reader.state.doc)).toEqual(['Notes']);
    // One undo takes back the text, and the block renders the text it had.
    undo(ada.state, (tr) => ada.dispatch(tr));
    expect(shown(ada.state.doc)).toEqual(['Plan']);
    await deliver();
    expect(shown(reader.state.doc)).toEqual(['Plan']);
    // Typing inside the block is refused before it reaches the room.
    const room = countUpdates(relay.room);
    let inside = -1;
    ada.state.doc.descendants((node, pos) => {
      if (inside < 0 && node.isText && node.text === 'Plan') inside = pos + 1;
    });
    ada.dispatch(ada.state.tr.insertText('x', inside));
    await deliver();
    expect(shown(ada.state.doc)).toEqual(['Plan']);
    expect(room.updates).toBe(0);
  });
});
