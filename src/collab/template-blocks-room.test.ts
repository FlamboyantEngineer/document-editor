// Template blocks in a room (DOCE-TEMPLATES-9.1): what a block renders is stored in the shared
// document, so every editor that edits directly renders it after any change to the stored texts,
// its own or not, wherever a block holds anything else. Two writers who render at once each insert
// the same blocks, which the room keeps both of; an editor that then finds a block holding what it
// renders whole beside other blocks only deletes the others, so every editor deletes the same ones
// and the room settles on one copy.

import type * as Y from '@y/y';
import { history, undo } from 'prosemirror-history';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { Plugin } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { describe, expect, it, vi } from 'vitest';
import {
  createRelayRoom,
  type HeadlessEditor,
  headlessEditor,
  readFixture,
  seededRandom,
  sharedDocument,
  undoManagerOf,
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

function roomOf(file: DocumentFile = FILE) {
  const first = headlessEditor(readFixture(file));
  const relay = createRelayRoom(first.doc);
  const start = sharedDocument(relay.room);
  first.destroy();
  if (!start) throw new Error('The room holds no document.');
  const join = (clientID: number, author: string, enabled = true, templates?: Plugin) =>
    headlessEditor(start, {
      doc: relay.join(clientID),
      plugins: [
        history(),
        templates ?? createDynamicTemplates({ enabled: () => enabled }),
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

  it('DOCE-TEMPLATES-9.1 falls quiet when two editors render a block otherwise, and tells the host once for each text', async () => {
    const { relay, join, deliver } = roomOf();
    const ada = join(1, 'ada');
    // An editor that reads the markup otherwise, as another version of the library might: its
    // parser adds a paragraph to what the markup renders.
    class OtherParser extends DOMParser {
      override parseFromString(source: string, type: DOMParserSupportedType): Document {
        const parsed = super.parseFromString(source, type);
        parsed.body.append(parsed.createElement('p'), parsed.createTextNode('Other'));
        return parsed;
      }
    }
    const otherOwner = {
      defaultView: { DOMParser: OtherParser },
      implementation: document.implementation,
    } as unknown as Document;
    const unsettled = vi.fn();
    const own = createDynamicTemplates({ onUnsettled: unsettled });
    const other = new Plugin({
      ...own.spec,
      view: (view: EditorView) =>
        own.spec.view?.(
          Object.create(view, { dom: { value: { ownerDocument: otherOwner } } }) as EditorView,
        ) ?? {},
    });
    const bob = join(2, 'bob', true, other);
    await deliver();
    const room = countUpdates(relay.room);
    setName(ada, 'Notes');
    const perPass: number[] = [];
    for (let pass = 0; pass < 12; pass += 1) {
      const before = room.updates;
      await deliver(1);
      perPass.push(room.updates - before);
    }
    // Each answers the other once at most, then the room goes quiet.
    expect(perPass.slice(4)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(room.updates).toBeLessThanOrEqual(4);
    // Told once for each text the block stood for: the one it opened with, and the new one.
    expect(unsettled.mock.calls).toEqual([['b0000001'], ['b0000001']]);
    for (const editor of [ada, bob]) {
      expect(sharedDocument(editor.doc)?.toJSON()).toEqual(sharedDocument(relay.room)?.toJSON());
    }
  });

  it('DOCE-TEMPLATES-9.1 DOCE-COLLAB-4.5 undoes a change of the texts and its render in a room as one step', async () => {
    const { relay, join, deliver } = roomOf();
    const ada = join(1, 'ada');
    const reader = join(3, 'reader', false);
    const manager = undoManagerOf(ada);
    setName(ada, 'Notes');
    await deliver();
    expect(shown(reader.state.doc)).toEqual(['Notes']);
    manager.undo();
    await deliver();
    for (const editor of [ada, reader]) {
      expect(shown(editor.state.doc)).toEqual(['Plan']);
      expect(editor.state.doc.attrs.values).toEqual({ 'document.name': 'Plan' });
    }
    expect(shown(sharedDocument(relay.room))).toEqual(['Plan']);
  });

  it('DOCE-TEMPLATES-9.1 renders a block that holds nothing once an editor opens the document', async () => {
    const empty: DocumentFile = {
      ...FILE,
      sections: [
        {
          name: null,
          content: [
            {
              type: 'templateBlock',
              attrs: { id: 'b0000001', source: '<p>{{document.name}}</p>' },
            },
          ],
        },
      ],
    };
    const { relay, join, deliver } = roomOf(empty);
    const reader = join(3, 'reader', false);
    await deliver();
    // A reader renders nothing.
    expect(shown(reader.state.doc).join('')).toBe('');
    const ada = join(1, 'ada');
    await deliver();
    for (const editor of [ada, reader]) expect(shown(editor.state.doc)).toEqual(['Plan']);
    expect(shown(sharedDocument(relay.room))).toEqual(['Plan']);
  });

  it.each(Array.from({ length: 10 }, (_, index) => index + 1))(
    'DOCE-TEMPLATES-9.1 DOCE-COLLAB-4.1 settles on one copy for three writers who change the texts in any order (seed %i)',
    async (seed) => {
      const { relay, join, deliver } = roomOf();
      const random = seededRandom(seed);
      const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)] as T;
      const writers = [join(1, 'ada'), join(2, 'grace'), join(5, 'lin')];
      const reader = join(3, 'reader', false);
      for (let step = 0; step < 6; step += 1) {
        setName(pick(writers), pick(['Notes', 'Minutes', 'Agenda']));
        relay.deliver(() => Math.floor(random() * 3));
        await settle();
      }
      await deliver(12);
      const values = sharedDocument(relay.room)?.attrs.values as Record<string, string>;
      for (const editor of [...writers, reader])
        expect(shown(editor.state.doc)).toEqual([values['document.name']]);
    },
  );
});
