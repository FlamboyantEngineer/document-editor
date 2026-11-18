// @vitest-environment node
import { encodeSyncUpdate } from '@flamboyantengineer/collaboration-tools/protocol';
import {
  createMemoryPersistence,
  createRoomServer,
  type RoomAdmission,
  type RoomHandle,
  type RoomServer,
  type RoomWriteRules,
} from '@flamboyantengineer/collaboration-tools/server';
import * as Y from '@y/y';
import type { Node } from 'prosemirror-model';
import { EditorState, type Plugin, TextSelection, type Transaction } from 'prosemirror-state';
import { afterEach, describe, expect, it } from 'vitest';
import { documentSchema as schema } from '../../test/document-markup.js';
import { assignElementIds } from '../engine/element-ids.js';
import { idOf } from '../engine/footnote-model.js';
import { createFootnotes, insertFootnote } from '../engine/footnotes.js';
import { suggestTransaction } from '../engine/suggestions.js';
import type { DocumentFile } from '../model/format/document-format.js';
import { writeRoomDocument } from './convert.js';
import { CONTENT_TYPE, readContent } from './delta.js';
import { diffNodes } from './diff.js';
import { openRoomChangeGuard } from './room-change-guard.js';

const ADMISSIONS: Record<string, string[]> = {
  editor: ['edit', 'comment'],
  suggester: ['suggest'],
  decider: ['decide'],
  commenter: ['comment'],
  owner: ['suggest'],
};

// The host's trusted resolver: each capability grants its own permission and nothing else.
const permissions = (_actor: { id: string }, capabilities: ReadonlySet<string>) => ({
  edit: capabilities.has('edit'),
  suggest: capabilities.has('suggest'),
  decide: capabilities.has('decide'),
  comment: capabilities.has('comment'),
});

const servers: RoomServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

const file = (count: number): DocumentFile =>
  ({
    formatVersion: 1,
    sections: [
      {
        name: null,
        content: Array.from({ length: count }, (_, index) => ({
          type: 'paragraph',
          attrs: { id: `p${String(index)}` },
          content: [{ type: 'text', text: `Paragraph ${String(index)} of the sample text.` }],
        })),
      },
    ],
  }) as DocumentFile;

const counter = () => {
  let next = 0;
  return () => `0000${(next++).toString(16).padStart(4, '0')}`;
};

const settle = async () => {
  for (let round = 0; round < 5; round += 1) await new Promise((done) => setImmediate(done));
};

// A room server whose rules open the change guard, with a room seeded by the host.
async function serveRoom(paragraphs: number, seed: DocumentFile = file(paragraphs)) {
  const rules: RoomWriteRules = {
    openGuard: (shadow) => openRoomChangeGuard(shadow, { schema, permissions }),
  };
  const server = createRoomServer({
    host: {
      auth: {
        admit: ({ token }): Promise<RoomAdmission> =>
          Promise.resolve({
            ok: true,
            actor: { id: token ?? 'reader' },
            access: 'read-write',
            capabilities: ADMISSIONS[token ?? ''] ?? [],
          }),
      },
      persistence: createMemoryPersistence(),
      permissions: { rulesFor: () => rules },
    },
  });
  servers.push(server);
  const handle = await server.openRoom('notes');
  const newId = counter();
  const seeded = handle.transact({ actor: { id: 'host' }, capabilities: ['edit'] }, (doc) =>
    writeRoomDocument(doc, seed, { schema, newId }),
  );
  if (!seeded) throw new Error('The host could not seed the room.');
  return { server, handle, newId };
}

// A writer that joins with `token`, edits a copy of the room as the editor's binding does, and
// sends each change as one frame; `closed` records whether the server closed it.
function joinAs(
  room: Awaited<ReturnType<typeof serveRoom>>,
  token: string,
  plugins: readonly Plugin[] = [],
) {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, room.handle.snapshot());
  let closed = false;
  const connection = room.server.connect(
    { send: () => undefined, close: () => (closed = true) },
    { url: `/live/notes?token=${token}`, headers: {} },
  );
  let state = EditorState.create({
    doc: readContent(schema, doc.get(CONTENT_TYPE)) ?? undefined,
    plugins: [...plugins],
  });
  const send = (change: () => void) => {
    const updates: Uint8Array[] = [];
    const capture = (update: Uint8Array) => updates.push(update);
    doc.on('update', capture);
    doc.transact(change);
    doc.off('update', capture);
    for (const update of updates) connection.receive(encodeSyncUpdate(update));
  };
  return {
    get closed() {
      return closed;
    },
    /** Writes to the writer's copy of the room directly, as a raw client could. */
    write(change: (doc: Y.Doc) => void) {
      send(() => change(doc));
    },
    edit(change: (state: EditorState) => Transaction, suggesting?: string) {
      const tr = change(state);
      const rewritten = suggesting
        ? suggestTransaction(tr, state, { author: suggesting, newId: room.newId })
        : tr;
      if (!rewritten) throw new Error('The change did nothing.');
      assignElementIds(rewritten, { newId: room.newId });
      // Applied with the writer's plugins, so what they append goes with the change.
      const { state: next } = state.applyTransaction(rewritten);
      const delta = diffNodes(state.doc, next.doc);
      state = next;
      send(() => doc.get(CONTENT_TYPE).applyDelta(delta as never));
    },
  };
}

function positionOf(doc: Node, value: string): number {
  let found = -1;
  doc.descendants((node, pos) => {
    if (found < 0 && node.isText && node.text?.includes(value))
      found = pos + node.text.indexOf(value);
    return found < 0;
  });
  if (found < 0) throw new Error(`No text "${value}".`);
  return found;
}

const typeAt =
  (value: string, text: string) =>
  (state: EditorState): Transaction => {
    const at = positionOf(state.doc, value);
    return state.tr.setSelection(TextSelection.create(state.doc, at)).insertText(text);
  };

// The room's text as the server holds it.
function roomText(handle: RoomHandle): string {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, handle.snapshot());
  return readContent(schema, doc.get(CONTENT_TYPE))?.textContent ?? '';
}

function roomDoc(handle: RoomHandle): Y.Doc {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, handle.snapshot());
  return doc;
}

describe('room change guard', () => {
  it('DOCE-COLLAB-6.7 keeps each writer to the permissions the host resolves, on a real room server', async () => {
    const room = await serveRoom(3);
    const editor = joinAs(room, 'editor');
    const suggester = joinAs(room, 'suggester');
    const commenter = joinAs(room, 'commenter');
    await settle();

    editor.edit(typeAt('Paragraph 0', 'Edited. '));
    suggester.edit(typeAt('Paragraph 1', 'Suggested. '), 'suggester');
    await settle();
    commenter.edit(typeAt('Paragraph 2', 'Not allowed. '));
    await settle();

    expect([editor.closed, suggester.closed, commenter.closed]).toEqual([false, false, true]);
    expect(roomText(room.handle)).toContain('Edited. Paragraph 0');
    expect(roomText(room.handle)).toContain('Suggested. Paragraph 1');
    expect(roomText(room.handle)).not.toContain('Not allowed.');
    room.handle.release();
  });

  it('DOCE-COLLAB-6.7 grants no permission through another: a suggester may not edit, a decider may not suggest', async () => {
    const room = await serveRoom(2);
    const suggester = joinAs(room, 'suggester');
    const decider = joinAs(room, 'decider');
    const editor = joinAs(room, 'editor');
    await settle();

    suggester.edit(typeAt('Paragraph 0', 'Plain. '));
    await settle();
    decider.edit(typeAt('Paragraph 1', 'Proposed. '), 'decider');
    await settle();
    editor.edit(typeAt('Paragraph 1', 'Kept. '));
    await settle();

    expect([suggester.closed, decider.closed, editor.closed]).toEqual([true, true, false]);
    expect(roomText(room.handle)).not.toContain('Plain.');
    expect(roomText(room.handle)).not.toContain('Proposed.');
    expect(roomText(room.handle)).toContain('Kept. Paragraph 1');
    room.handle.release();
  });

  it('DOCE-COLLAB-6.7 refuses a change to a type outside the room’s layout, whoever writes it', async () => {
    const room = await serveRoom(1);
    const editor = joinAs(room, 'editor');
    await settle();

    editor.write((doc) => doc.get('elsewhere').setAttr('hidden', 'data'));
    await settle();

    expect(editor.closed).toBe(true);
    expect(roomDoc(room.handle).get('elsewhere').getAttr('hidden')).toBeUndefined();
    room.handle.release();
  });

  it('DOCE-COLLAB-6.7 sorts each keystroke of a 1,000-paragraph room without copying the room', async () => {
    const room = await serveRoom(1_000);
    const editor = joinAs(room, 'editor');
    await settle();
    const size = room.handle.snapshot().length;

    const started = performance.now();
    for (let keystroke = 0; keystroke < 50; keystroke += 1) {
      editor.edit(typeAt(`Paragraph ${String(keystroke * 19)} `, 'x'));
    }
    const perKeystrokeMs = (performance.now() - started) / 50;
    await settle();

    expect(editor.closed).toBe(false);
    expect(size).toBeGreaterThan(50_000);
    // Copying this room for each check took about 15 ms per keystroke (review 4, X-2); the guard on
    // the server's shadow takes about a millisecond, the writer's own diff included.
    expect(perKeystrokeMs).toBeLessThan(10);
    room.handle.release();
  });

  describe('DOCE-COLLAB-4.1 DOCE-COLLAB-6.7 a suggester’s mark on an inline embed', () => {
    const holding = {
      formatVersion: 1,
      sections: [
        {
          name: null,
          content: [
            {
              type: 'paragraph',
              attrs: { id: 'p0' },
              content: [
                { type: 'text', text: 'Total ' },
                {
                  type: 'embed_inline',
                  attrs: {
                    id: 'e0000001',
                    kind: 'cell',
                    source: 'book!B2',
                    snapshot: 'r1',
                    text: '42',
                  },
                },
                { type: 'text', text: ' kept.' },
              ],
            },
          ],
        },
      ],
    } as DocumentFile;
    // Suggests removing the embed, which marks it as a suggested deletion.
    const removeEmbed = (state: EditorState): Transaction => {
      let at = -1;
      state.doc.descendants((node, pos) => {
        if (node.type.name === 'embed_inline') at = pos;
        return at < 0;
      });
      return state.tr.delete(at, at + 1);
    };
    const embedMarks = (handle: RoomHandle) => {
      const marks: string[] = [];
      readContent(schema, roomDoc(handle).get(CONTENT_TYPE))?.descendants((node) => {
        if (node.type.name === 'embed_inline')
          marks.push(...node.marks.map((mark) => mark.type.name));
      });
      return marks;
    };

    it('admits the mark as the suggester’s own', async () => {
      const room = await serveRoom(0, holding);
      const suggester = joinAs(room, 'suggester');
      await settle();
      suggester.edit(removeEmbed, 'suggester');
      await settle();
      expect(suggester.closed).toBe(false);
      expect(embedMarks(room.handle)).toEqual(['deletion']);
      // The guard's kept reading holds the mark, so a later keystroke is checked against it.
      suggester.edit(typeAt(' kept.', ' Also'), 'suggester');
      await settle();
      expect(suggester.closed).toBe(false);
      expect(roomText(room.handle)).toContain('Also kept.');
      room.handle.release();
    });

    it('refuses the mark under another writer’s name', async () => {
      const room = await serveRoom(0, holding);
      const suggester = joinAs(room, 'suggester');
      await settle();
      suggester.edit(removeEmbed, 'editor');
      await settle();
      expect(suggester.closed).toBe(true);
      expect(embedMarks(room.handle)).toEqual([]);
      room.handle.release();
    });
  });

  describe('DOCE-COLLAB-4.1 DOCE-COLLAB-6.7 a footnote marker’s mark sent with its number', () => {
    // A room holding one footnote, inserted by an editor or suggested by another writer.
    const insertAt =
      (value: string, id: string, numbering?: number) =>
      (state: EditorState): Transaction => {
        const at = positionOf(state.doc, value);
        const placed = state.apply(state.tr.setSelection(TextSelection.create(state.doc, at)));
        let made: Transaction | undefined;
        insertFootnote({ newId: () => id })(placed, (tr) => (made = tr));
        if (!made) throw new Error('The footnote was not inserted.');
        const tr = made;
        // Gives every footnote that number, as a writer whose copy has numbered only its own: the
        // others keep the number they had.
        if (numbering !== undefined)
          tr.doc.descendants((node, pos) => {
            if (idOf(node)) tr.setNodeAttribute(pos, 'footnoteNumber', numbering);
          });
        return tr;
      };
    // A room whose one footnote is inserted by an editor or suggested by another writer; then an
    // editor puts a footnote before it, numbered 1, and leaves the later one at 1 too, so 2 is the
    // number the editors' numbering gives the later marker.
    const footnoteRoom = async (suggestedBy?: string) => {
      const room = await serveRoom(1);
      const writer = joinAs(room, suggestedBy ?? 'editor', [createFootnotes()]);
      await settle();
      writer.edit(insertAt(' of the sample', 'n0000001'), suggestedBy);
      await settle();
      const editor = joinAs(room, 'editor');
      await settle();
      editor.edit(insertAt('Paragraph', 'n0000009', 1));
      await settle();
      if (writer.closed || editor.closed) throw new Error('A footnote was refused.');
      expect(markerNumber(room.handle)).toBe(1);
      return room;
    };
    // The marker of the footnote put in first, the later one in the room.
    const markerAt = (doc: Node) => {
      let at = -1;
      doc.descendants((node, pos) => {
        if (node.type.name === 'footnote_reference' && idOf(node) !== 'n0000009') at = pos;
        return at < 0;
      });
      return at;
    };
    const markerMarks = (handle: RoomHandle) => {
      const doc = readContent(schema, roomDoc(handle).get(CONTENT_TYPE));
      const at = doc ? markerAt(doc) : -1;
      return doc
        ?.nodeAt(at)
        ?.marks.map((mark) => `${mark.type.name}:${String(mark.attrs.dataAuthor)}`);
    };
    const markerNumber = (handle: RoomHandle): unknown => {
      const doc = readContent(schema, roomDoc(handle).get(CONTENT_TYPE));
      return doc?.nodeAt(markerAt(doc))?.attrs.footnoteNumber;
    };
    const numbered = (state: EditorState, tr: Transaction) =>
      tr.setNodeAttribute(markerAt(state.doc), 'footnoteNumber', 2);

    it('refuses a suggester taking another writer’s insertion mark off a marker with its number', async () => {
      const room = await footnoteRoom('owner');
      expect(markerMarks(room.handle)).toEqual(['insertion:owner']);
      const suggester = joinAs(room, 'suggester');
      await settle();
      suggester.edit((state) => {
        const at = markerAt(state.doc);
        const insertion = schema.marks.insertion;
        if (!insertion) throw new Error('No suggested insertions.');
        return numbered(state, state.tr.removeMark(at, at + 1, insertion));
      });
      await settle();
      expect(suggester.closed).toBe(true);
      expect(markerMarks(room.handle)).toEqual(['insertion:owner']);
      expect(markerNumber(room.handle)).toBe(1);
      room.handle.release();
    });

    it('refuses a suggester a deletion mark under another writer’s name on a marker with its number', async () => {
      const room = await footnoteRoom();
      expect(markerMarks(room.handle)).toEqual([]);
      const suggester = joinAs(room, 'suggester');
      await settle();
      suggester.edit((state) => {
        const at = markerAt(state.doc);
        const deletion = schema.marks.deletion;
        if (!deletion) throw new Error('No suggested deletions.');
        const mark = deletion.create({ dataId: 's0000010', dataAuthor: 'owner' });
        return numbered(state, state.tr.addMark(at, at + 1, mark));
      });
      await settle();
      expect(suggester.closed).toBe(true);
      expect(markerMarks(room.handle)).toEqual([]);
      expect(markerNumber(room.handle)).toBe(1);
      room.handle.release();
    });

    it('admits the number alone, which every writer may set', async () => {
      const room = await footnoteRoom('owner');
      const suggester = joinAs(room, 'suggester');
      await settle();
      suggester.edit((state) => numbered(state, state.tr));
      await settle();
      expect(suggester.closed).toBe(false);
      expect(markerMarks(room.handle)).toEqual(['insertion:owner']);
      expect(markerNumber(room.handle)).toBe(2);
      room.handle.release();
    });
  });

  it('DOCE-COLLAB-4.1 DOCE-COLLAB-6.7 admits a suggested paragraph inserted whole with a marked inline embed, kept with its mark', async () => {
    const room = await serveRoom(1);
    const suggester = joinAs(room, 'suggester');
    await settle();
    suggester.edit((state) => {
      const type = schema.nodes.embed_inline;
      const block = schema.nodes.paragraph;
      if (!type || !block) throw new Error('No inline embeds.');
      const embed = type.create({
        id: 'e0000003',
        kind: 'cell',
        source: 'book!D4',
        snapshot: 'r1',
        text: '7',
      });
      const end = positionOf(state.doc, 'sample text.') + 'sample text.'.length + 1;
      return state.tr.insert(end, block.create(null, [schema.text('New '), embed]));
    }, 'suggester');
    await settle();
    expect(suggester.closed).toBe(false);
    const held = readContent(schema, roomDoc(room.handle).get(CONTENT_TYPE));
    const marks: string[] = [];
    held?.descendants((node) => {
      if (node.type.name === 'embed_inline')
        marks.push(...node.marks.map((mark) => mark.type.name));
    });
    expect(marks).toEqual(['insertion']);
    // The guard's reading holds the mark: the suggester's next keystroke in the paragraph passes.
    suggester.edit(typeAt('New ', 'Also '), 'suggester');
    await settle();
    expect(suggester.closed).toBe(false);
    room.handle.release();
  });
});
