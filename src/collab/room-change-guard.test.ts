// @vitest-environment node
import { encodeSyncUpdate } from '@flamboyantengineer/collaboration-tools/protocol';
import {
  createMemoryPersistence,
  createRoomServer,
  type RoomAdmission,
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

const CAPABILITIES = { comment: 'comment', review: 'review', content: 'edit' } as const;

const ADMISSIONS: Record<string, string[]> = {
  editor: ['edit'],
  reviewer: ['review'],
  commenter: ['comment'],
};

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
    openGuard: (shadow) => openRoomChangeGuard(shadow, { schema, capabilities: CAPABILITIES }),
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
  writeRoomDocument(handle.doc, file(paragraphs), { schema, newId });
  return { server, handle, newId };
}

// A writer that joins with `token`, edits a copy of the room as the editor's binding does, and
// sends each change as one frame; `closed` records whether the server closed it.
function joinAs(room: Awaited<ReturnType<typeof serveRoom>>, token: string) {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, Y.encodeStateAsUpdate(room.handle.doc));
  let closed = false;
  const connection = room.server.connect(
    { send: () => undefined, close: () => (closed = true) },
    { url: `/live/notes?token=${token}`, headers: {} },
  );
  let state = EditorState.create({ doc: readContent(schema, doc.get(CONTENT_TYPE)) ?? undefined });
  return {
    get closed() {
      return closed;
    },
    edit(change: (state: EditorState) => Transaction, suggesting?: string) {
      const tr = change(state);
      const rewritten = suggesting
        ? suggestTransaction(tr, state, { author: suggesting, newId: room.newId })
        : tr;
      if (!rewritten) throw new Error('The change did nothing.');
      assignElementIds(rewritten, { newId: room.newId });
      const next = state.apply(rewritten);
      const updates: Uint8Array[] = [];
      const capture = (update: Uint8Array) => updates.push(update);
      doc.on('update', capture);
      doc.transact(() => doc.get(CONTENT_TYPE).applyDelta(diffNodes(state.doc, next.doc) as never));
      doc.off('update', capture);
      state = next;
      for (const update of updates) connection.receive(encodeSyncUpdate(update));
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

const roomText = (doc: Y.Doc) => readContent(schema, doc.get(CONTENT_TYPE))?.textContent ?? '';

describe('room change guard', () => {
  it('DOCE-COLLAB-6.7 keeps each writer to the permission their capabilities give, on a real room server', async () => {
    const room = await serveRoom(3);
    const editor = joinAs(room, 'editor');
    const reviewer = joinAs(room, 'reviewer');
    const commenter = joinAs(room, 'commenter');
    await settle();

    editor.edit(typeAt('Paragraph 0', 'Edited. '));
    reviewer.edit(typeAt('Paragraph 1', 'Suggested. '), 'reviewer');
    await settle();
    commenter.edit(typeAt('Paragraph 2', 'Not allowed. '));
    await settle();

    expect([editor.closed, reviewer.closed, commenter.closed]).toEqual([false, false, true]);
    expect(roomText(room.handle.doc)).toContain('Edited. Paragraph 0');
    expect(roomText(room.handle.doc)).toContain('Suggested. Paragraph 1');
    expect(roomText(room.handle.doc)).not.toContain('Not allowed.');
    room.handle.release();
  });

  it('DOCE-COLLAB-6.7 refuses a reviewer’s plain edit and keeps sorting the next writer’s updates', async () => {
    const room = await serveRoom(2);
    const reviewer = joinAs(room, 'reviewer');
    const editor = joinAs(room, 'editor');
    await settle();

    reviewer.edit(typeAt('Paragraph 0', 'Plain. '));
    await settle();
    editor.edit(typeAt('Paragraph 1', 'Kept. '));
    await settle();

    expect([reviewer.closed, editor.closed]).toEqual([true, false]);
    expect(roomText(room.handle.doc)).not.toContain('Plain.');
    expect(roomText(room.handle.doc)).toContain('Kept. Paragraph 1');
    room.handle.release();
  });

  it('DOCE-COLLAB-6.7 sorts each keystroke of a 1,000-paragraph room without copying the room', async () => {
    const room = await serveRoom(1_000);
    const editor = joinAs(room, 'editor');
    await settle();
    const size = Y.encodeStateAsUpdate(room.handle.doc).length;

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
