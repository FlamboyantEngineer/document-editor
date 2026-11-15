// @vitest-environment node
import { encodeSyncUpdate } from '@flamboyantengineer/collaboration-tools/protocol';
import {
  createMemoryPersistence,
  createRoomServer,
} from '@flamboyantengineer/collaboration-tools/server';
import * as Y from '@y/y';
import type { Node } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { expect, it, vi } from 'vitest';
import { documentSchema as schema } from '../../test/document-markup.js';
import type { DocumentFile } from '../model/index.js';
import { writeRoomDocument } from './convert.js';
import { readContent } from './delta.js';
import { diffNodes } from './diff.js';
import { openRoomChangeGuard } from './room-change-guard.js';

function seedDocument(file: DocumentFile, proposals: number): Uint8Array {
  const doc = new Y.Doc();
  writeRoomDocument(doc, file, { schema });
  if (proposals) {
    const held = readContent(schema, doc.get('content'));
    if (!held) throw new Error('Missing seed.');
    const mark = schema.marks.insertion;
    if (!mark) throw new Error('Missing insertion.');
    const tr = EditorState.create({ doc: held }).tr;
    let next = 0;
    held.descendants((node, pos) => {
      if (node.isTextblock && next < proposals) {
        tr.addMark(
          pos + 1,
          pos + 5,
          mark.create({ dataId: `s${String(next++)}`, dataAuthor: 'reviewer' }),
        );
        return false;
      }
      return true;
    });
    doc.get('content').applyDelta(diffNodes(held, tr.doc) as never);
  }
  const update = Y.encodeStateAsUpdate(doc);
  doc.destroy();
  return update;
}

function prepareUpdates(doc: Y.Doc): Uint8Array[] {
  const initial = readContent(schema, doc.get('content'));
  if (!initial) throw new Error('Missing seeded content.');
  let held: Node = initial;
  let at = 0;
  held.descendants((node, pos) => {
    if (
      !at &&
      node.isText &&
      !node.marks.some((mark) =>
        ['insertion', 'deletion', 'format_change'].includes(mark.type.name),
      )
    )
      at = pos + 1;
  });
  return Array.from({ length: 25 }, () => {
    const before = Y.encodeStateVector(doc);
    const next = EditorState.create({ doc: held }).tr.insertText('x', at).doc;
    doc.get('content').applyDelta(diffNodes(held, next) as never);
    held = next;
    return encodeSyncUpdate(Y.encodeStateAsUpdate(doc, before));
  });
}

it.each([
  { paragraphs: 200, proposals: 0, medianBudget: 5 },
  { paragraphs: 1000, proposals: 0, medianBudget: 12 },
  { paragraphs: 3000, proposals: 0, medianBudget: 35 },
  { paragraphs: 1000, proposals: 500, medianBudget: 20 },
])(
  'DOCE-COLLAB-7.2 checks semantic shadow and live follow at $paragraphs paragraphs and $proposals proposals',
  async ({ paragraphs, proposals, medianBudget }) => {
    const file: DocumentFile = {
      formatVersion: 1,
      template: null,
      sections: [
        {
          name: null,
          content: Array.from({ length: paragraphs }, (_, index) => ({
            type: 'paragraph',
            attrs: { id: `p${index.toString().padStart(8, '0')}` },
            content: [
              {
                type: 'text',
                text: 'A representative paragraph contains ordinary document text, several words and a stable element identity.',
              },
            ],
          })),
        },
      ],
    };
    let checked = 0;
    let sent = 0;
    let closed = false;
    const server = createRoomServer({
      host: {
        persistence: createMemoryPersistence(),
        seeds: { seed: () => Promise.resolve(seedDocument(file, proposals)) },
        auth: {
          admit: () =>
            Promise.resolve({
              ok: true,
              actor: { id: 'editor' },
              access: 'read-write',
              capabilities: ['edit'],
            }),
        },
        permissions: {
          rulesFor: () => ({
            openGuard: (shadow) => {
              const guard = openRoomChangeGuard(shadow, {
                schema,
                permissions: () => ({ edit: true, suggest: false, comment: false, decide: false }),
              });
              return {
                check(change) {
                  checked++;
                  return guard.check(change);
                },
                destroy: () => guard.destroy(),
              };
            },
          }),
        },
      },
    });
    const handle = await server.openRoom('notes');
    const writer = new Y.Doc();
    Y.applyUpdate(writer, handle.snapshot());
    const updates = prepareUpdates(writer);
    const connection = server.connect(
      {
        send: () => {
          sent++;
        },
        close: () => {
          closed = true;
        },
      },
      { url: '/live/notes', headers: {} },
    );
    await vi.waitFor(() => expect(sent).toBeGreaterThan(0));
    await new Promise<void>((resolve) => setImmediate(resolve));
    try {
      const samples: number[] = [];
      for (const [index, frame] of updates.entries()) {
        const before = checked;
        const started = performance.now();
        connection.receive(frame);
        const elapsed = performance.now() - started;
        expect(checked).toBe(before + 1);
        if (index >= 5) samples.push(elapsed);
      }
      samples.sort((a, b) => a - b);
      const median = samples[10];
      const p95 = samples[19];
      expect(closed).toBe(false);
      expect(median).toBeDefined();
      expect(median).toBeLessThan(medianBudget);
      console.info(JSON.stringify({ paragraphs, proposals, medianMs: median, p95Ms: p95 }));
      const settled = new Y.Doc();
      Y.applyUpdate(settled, handle.snapshot());
      expect(
        readContent(schema, settled.get('content'))?.eq(
          readContent(schema, writer.get('content')) as NonNullable<ReturnType<typeof readContent>>,
        ),
      ).toBe(true);
      settled.destroy();
    } finally {
      connection.closed();
      handle.release();
      writer.destroy();
      await server.close();
    }
  },
);
