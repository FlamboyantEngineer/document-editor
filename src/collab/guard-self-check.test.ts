// @vitest-environment node
import { createRoomProvider } from '@flamboyantengineer/collaboration-tools/client';
import {
  createMemoryPersistence,
  createRoomServer,
  type RoomEvent,
} from '@flamboyantengineer/collaboration-tools/server';
import { connectToServer } from '@flamboyantengineer/collaboration-tools/testing';
import * as Y from '@y/y';
import { EditorState } from 'prosemirror-state';
import { describe, expect, it, vi } from 'vitest';
import { documentSchema as schema } from '../../test/document-markup.js';
import type { DocumentFile } from '../model/index.js';
import { documentToYjs } from './convert.js';
import { readContent } from './delta.js';
import { diffNodes } from './diff.js';
import type * as Replay from './replay.js';
import { openRoomChangeGuard } from './room-change-guard.js';

const skip = vi.hoisted(() => ({ next: false }));

vi.mock('./replay.js', async (importOriginal) => {
  const actual = await importOriginal<typeof Replay>();
  return {
    ...actual,
    replayChange: (...args: Parameters<typeof actual.replayChange>) => {
      // Lets a test make the guard's kept reading miss one change, as a replay defect would.
      if (skip.next) {
        skip.next = false;
        return;
      }
      actual.replayChange(...args);
    },
  };
});

const file = (text: string): DocumentFile => ({
  formatVersion: 1,
  template: null,
  sections: [
    {
      name: null,
      content: [
        { type: 'paragraph', attrs: { id: 'a0000001' }, content: [{ type: 'text', text }] },
      ],
    },
  ],
});

function seeded(text: string) {
  const shadow = new Y.Doc();
  Y.applyUpdate(shadow, documentToYjs(file(text), { schema }));
  return shadow;
}

// Where the paragraph's text starts.
const start = (state: EditorState) => {
  let found = -1;
  state.doc.descendants((node, pos) => {
    if (node.type.name === 'paragraph') found = pos + 1;
    return found < 0;
  });
  return found;
};

function edit(doc: Y.Doc, action: (state: EditorState) => EditorState) {
  const held = readContent(schema, doc.get('content'));
  if (!held) throw new Error('Missing seeded content.');
  const next = action(EditorState.create({ doc: held }));
  doc.get('content').applyDelta(diffNodes(held, next.doc) as never);
}

const open = (shadow: Y.Doc) =>
  openRoomChangeGuard(shadow, {
    schema,
    permissions: () => ({ edit: true, suggest: true, comment: true, decide: true }),
  });

describe('DOCE-COLLAB-7.3 guard self-check', () => {
  it('verifies its kept reading against the shadow read from scratch after every change', () => {
    const shadow = seeded('Original');
    const guard = open(shadow);
    expect(guard.verify()).toBe(true);
    for (let step = 0; step < 20; step++) {
      edit(shadow, (state) => state.apply(state.tr.insertText(String(step % 10), 1 + (step % 5))));
      expect(guard.verify()).toBe(true);
    }
    edit(shadow, (state) => state.apply(state.tr.delete(1, 6)));
    expect(guard.verify()).toBe(true);
    guard.destroy();
    shadow.destroy();
  });

  it('DOCE-EMBEDS-1.4 agrees after an inline embed is inserted, updated and removed', () => {
    const shadow = seeded('Original');
    const guard = open(shadow);
    const type = schema.nodes.embed_inline;
    if (!type) throw new Error('No inline embeds.');
    const at = (state: EditorState) => {
      let found = -1;
      state.doc.descendants((node, pos) => {
        if (node.type === type) found = pos;
        return found < 0;
      });
      return found;
    };
    edit(shadow, (state) =>
      state.apply(
        state.tr.insert(2, type.create({ id: 'e0000001', kind: 'cell', source: 'B2', text: '42' })),
      ),
    );
    expect(guard.verify()).toBe(true);
    edit(shadow, (state) => state.apply(state.tr.setNodeAttribute(at(state), 'text', '43')));
    expect(guard.verify()).toBe(true);
    edit(shadow, (state) => state.apply(state.tr.setNodeAttribute(at(state), 'pinned', true)));
    expect(guard.verify()).toBe(true);
    edit(shadow, (state) => state.apply(state.tr.delete(at(state), at(state) + 1)));
    expect(guard.verify()).toBe(true);
    guard.destroy();
    shadow.destroy();
  });

  it('DOCE-COLLAB-4.1 agrees after a writer gives an inline embed a mark together with a new attribute', () => {
    const shadow = seeded('Original');
    const guard = open(shadow);
    const marker = schema.nodes.footnote_reference;
    const insertion = schema.marks.insertion;
    if (!marker || !insertion) throw new Error('No footnote markers or suggested insertions.');
    const mark = insertion.create({ dataId: 's0000001' });
    // The writer's changes reach the shadow as updates, as the server takes them.
    const writer = new Y.Doc();
    Y.applyUpdate(writer, Y.encodeStateAsUpdate(shadow));
    const send = (action: (state: EditorState) => EditorState) => {
      const known = Y.encodeStateVector(shadow);
      edit(writer, action);
      Y.applyUpdate(shadow, Y.encodeStateAsUpdate(writer, known));
    };
    // Suggested text, then a marker beside it, which takes the same mark and a new id later.
    send((state) =>
      state.apply(
        state.tr.replaceWith(start(state), start(state) + 8, [
          schema.text('Cites', [mark]),
          marker.create({ footnoteId: 'n1' }),
          schema.text(' on'),
        ]),
      ),
    );
    expect(guard.verify()).toBe(true);
    send((state) =>
      state.apply(
        state.tr
          .addMark(start(state) + 5, start(state) + 6, mark)
          .setNodeAttribute(start(state) + 5, 'dataId', 'm0000001'),
      ),
    );
    expect(guard.verify()).toBe(true);
    guard.destroy();
    writer.destroy();
    shadow.destroy();
  });

  it('reports a kept reading that missed a change, and a destroyed guard', () => {
    const shadow = seeded('Original');
    const guard = open(shadow);
    skip.next = true;
    edit(shadow, (state) => state.apply(state.tr.insertText('X', start(state))));

    expect(guard.verify()).toBe(false);
    const reopened = open(shadow);
    expect(reopened.verify()).toBe(true);
    reopened.destroy();
    expect(reopened.verify()).toBe(false);
    guard.destroy();
    shadow.destroy();
  });

  it('rebuilds a drifted reading on a real room server with verifyEvery 1, and reports it', async () => {
    const events: RoomEvent[] = [];
    let opens = 0;
    const server = createRoomServer({
      storeDebounceMs: 0,
      host: {
        persistence: createMemoryPersistence(),
        auth: {
          admit: () => Promise.resolve({ ok: true, actor: { id: 'writer' }, access: 'read-write' }),
        },
        events: { emit: (event) => void events.push(event) },
        permissions: {
          rulesFor: () => ({
            verifyEvery: 1,
            openGuard: (shadow) => {
              opens++;
              return open(shadow);
            },
          }),
        },
        seeds: { seed: () => Promise.resolve(documentToYjs(file('Original'), { schema })) },
      },
    });
    const doc = new Y.Doc();
    const provider = createRoomProvider({
      endpoint: 'ws://test/rooms',
      room: 'guarded',
      doc,
      createSocket: connectToServer(server).createSocket,
    });
    try {
      await vi.waitFor(() => expect(provider.getState().synced).toBe(true));
      edit(doc, (state) => state.apply(state.tr.insertText('A', start(state))));
      expect(await provider.whenStored()).toBe(true);
      expect(events.filter((event) => event.type === 'guard-repaired')).toEqual([]);

      skip.next = true;
      edit(doc, (state) => state.apply(state.tr.insertText('B', start(state))));
      expect(await provider.whenStored()).toBe(true);
      expect(events.filter((event) => event.type === 'guard-repaired')).toEqual([
        { type: 'guard-repaired', room: 'guarded', reason: 'reading' },
      ]);
      expect(opens).toBe(2);
      // The rebuilt guard reads the room as it is and keeps admitting the writer's edits.
      edit(doc, (state) => state.apply(state.tr.insertText('C', start(state))));
      expect(await provider.whenStored()).toBe(true);
      expect(provider.getState().refusal).toBeNull();
    } finally {
      provider.destroy();
      await server.close();
      doc.destroy();
    }
  });
});

describe('a guard whose kept reading the room no longer matches', () => {
  it('DOCE-COLLAB-7.3 takes later transactions without throwing while the room holds what its schema cannot read', async () => {
    const { applyEdits } = await import('../engine/automation.js');
    const { readDocumentFile, writeDocumentFile } = await import('../model/index.js');
    // A room holding another writer's suggestion, so the guard keeps the suggestion's anchors.
    const listed = file('Logged.');
    listed.sections[0]?.content.push({
      type: 'bulletList',
      attrs: { id: 'a0000002' },
      content: [
        {
          type: 'listItem',
          attrs: { id: 'a0000003' },
          content: [
            {
              type: 'paragraph',
              attrs: { id: 'a0000004' },
              content: [{ type: 'text', text: 'One' }],
            },
          ],
        },
      ],
    });
    const state = EditorState.create({ doc: readDocumentFile(listed, schema).doc });
    const edit = applyEdits(
      state,
      [{ op: 'insertText', at: { elementId: 'a0000001', from: 6 }, text: ' now' }],
      { actor: { id: 'carol', kind: 'human' }, mode: 'suggest', newId: () => 'b0000001' },
    );
    if (!edit.ok) throw new Error(edit.error.message);
    const shadow = new Y.Doc();
    Y.applyUpdate(shadow, documentToYjs(writeDocumentFile(state.apply(edit.tr).doc), { schema }));
    const guard = openRoomChangeGuard(shadow, {
      schema,
      permissions: () => ({ edit: true, suggest: true, comment: true, decide: true }),
    });
    const { create } = await import('lib0/delta');
    const below = (type: Y.Type, index: number) => type.get(index) as Y.Type;
    const body = below(below(below(shadow.get('content'), 0), 0), 1);
    // A trusted server write of a block a newer schema added, before the list.
    body.applyDelta(
      create()
        .retain(1)
        .insert([create('hologram').insert('New').done()])
        .done() as never,
    );
    expect(() => shadow.transact(() => shadow.get('meta').setAttr('note', 1))).not.toThrow();
    expect(guard.verify()).toBe(false);
    guard.destroy();
  });
});
