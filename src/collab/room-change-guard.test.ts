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
import { EditorState, TextSelection, type Transaction } from 'prosemirror-state';
import { afterEach, describe, expect, it } from 'vitest';
import { documentSchema as schema } from '../../test/document-markup.js';
import { assignElementIds } from '../engine/element-ids.js';
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
async function serveRoom(paragraphs: number) {
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
    writeRoomDocument(doc, file(paragraphs), { schema, newId }),
  );
  if (!seeded) throw new Error('The host could not seed the room.');
  return { server, handle, newId };
}

// A writer that joins with `token`, edits a copy of the room as the editor's binding does, and
// sends each change as one frame; `closed` records whether the server closed it.
function joinAs(room: Awaited<ReturnType<typeof serveRoom>>, token: string) {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, room.handle.snapshot());
  let closed = false;
  const connection = room.server.connect(
    { send: () => undefined, close: () => (closed = true) },
    { url: `/live/notes?token=${token}`, headers: {} },
  );
  let state = EditorState.create({ doc: readContent(schema, doc.get(CONTENT_TYPE)) ?? undefined });
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
      const next = state.apply(rewritten);
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
});
