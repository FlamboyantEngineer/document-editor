import { readFileSync } from 'node:fs';
import * as Y from '@y/y';
import type { Node } from 'prosemirror-model';
import { expect, it } from 'vitest';
import { headlessEditor, readFixture, undoManagerOf } from '../../test/collab-fixtures.js';
import { documentSchema as schema } from '../../test/document-markup.js';
import type { CommentThread } from '../host/comment-adapters.js';
import { createMemoryHost } from '../host/index.js';
import type { DocumentFile } from '../model/index.js';
import { createRoomCommentStore } from './comment-store.js';
import { documentToYjs, readRoomDocument, writeRoomDocument, yjsToDocument } from './convert.js';
import { mergeRoomDraft } from './offline.js';
import { fromRelativeJSON, toRelativeJSON } from './relative-positions.js';
import { createRoomScope } from './room-scope.js';

const textOf = (node: Node) => node.textContent;

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

it('DOCE-COLLAB-7.1 isolates two fields, undo, comments, relative positions and disposal in one room', async () => {
  const doc = new Y.Doc();
  const first = createRoomScope(doc, 'first');
  const second = createRoomScope(doc, 'second');
  writeRoomDocument(doc, file('First'), { schema, scope: first });
  writeRoomDocument(doc, file('Second'), { schema, scope: second });
  const a = headlessEditor(readFixture(file('First')), { doc, scope: first });
  const b = headlessEditor(readFixture(file('Second')), { doc, scope: second });
  const undoA = undoManagerOf(a);
  const undoB = undoManagerOf(b);
  const end = (editor: typeof a) => {
    let found = 0;
    editor.state.doc.descendants((node, pos) => {
      if (node.isText) found = pos + node.nodeSize;
    });
    return found;
  };
  a.dispatch(a.state.tr.insertText(' A', end(a)));
  b.dispatch(b.state.tr.insertText(' B', end(b)));
  expect(textOf(a.state.doc)).toBe('First A');
  expect(textOf(b.state.doc)).toBe('Second B');
  undoA.undo();
  expect(textOf(a.state.doc)).toBe('First');
  expect(textOf(b.state.doc)).toBe('Second B');
  const relative = toRelativeJSON(first.content, a.state.doc, 3);
  expect(fromRelativeJSON(second.content, b.state.doc, relative)).toBeNull();
  const identity = createMemoryHost({ person: { id: 'writer', name: 'Writer' } }).identity;
  const commentsA = createRoomCommentStore({ doc, scope: first, identity });
  const commentsB = createRoomCommentStore({ doc, scope: second, identity });
  await commentsA.create('first', { id: 'thread', quote: 'First', text: 'First discussion' });
  expect(await commentsB.list('second')).toEqual({ ok: true, value: [] });
  expect((await commentsA.list('first')).ok).toBe(true);
  a.destroy();
  b.dispatch(b.state.tr.insertText('!', end(b)));
  expect(textOf(b.state.doc)).toBe('Second B!');
  expect(readRoomDocument(doc, { schema, scope: first })).toEqual(file('First'));
  undoA.destroy();
  undoB.destroy();
  b.destroy();
  doc.destroy();
});

it('DOCE-COLLAB-7.1 converts named field snapshots independently with full document defaults unchanged', () => {
  const doc = new Y.Doc();
  const scope = createRoomScope(doc, 'quoted:key');
  const update = documentToYjs(file('Field'), { schema, scope });
  expect(yjsToDocument(update, { schema, scope })).toEqual(file('Field'));
  expect(yjsToDocument(update, { schema })).toBeNull();
  expect(createRoomScope(doc).content).toBe(doc.get('content'));
  expect(() => createRoomScope(doc, '')).toThrow('must not be empty');
  doc.destroy();
});

it('DOCE-COLLAB-7.1 freezes the named room layout and discussion record contract', async () => {
  const fixture = JSON.parse(
    readFileSync('test/fixtures/documents/contracts/field-room.json', 'utf8'),
  ) as {
    fieldKey: string;
    roots: string[];
    presenceField: string;
    commentKeys: string[];
    document: DocumentFile;
    thread: CommentThread;
  };
  const doc = new Y.Doc();
  const scope = createRoomScope(doc, fixture.fieldKey);
  writeRoomDocument(doc, fixture.document, { schema, scope });
  const comments = createRoomCommentStore({
    doc,
    scope,
    identity: createMemoryHost({ person: { id: 'writer', name: 'Writer' } }).identity,
    createId: () => 'entry',
    now: () => new Date('2026-01-01T00:00:00.000Z'),
  });
  await comments.create('field', { id: 'discussion', quote: 'Field', text: 'Discussion' });
  expect([...doc.share.keys()].sort()).toEqual(fixture.roots);
  expect(scope.presence).toBe(fixture.presenceField);
  expect(readRoomDocument(doc, { schema, scope })).toEqual(fixture.document);
  expect(await comments.list('field')).toEqual({ ok: true, value: [fixture.thread] });
  const keys: string[] = [];
  scope.comments.forEachAttr((_value: unknown, key: string | number) => keys.push(String(key)));
  expect(keys.sort()).toEqual(fixture.commentKeys);
  doc.destroy();
});

it('DOCE-COLLAB-7.1 merges only the selected field from a whole-room offline draft', () => {
  const cached = new Y.Doc();
  const first = createRoomScope(cached, 'first');
  const second = createRoomScope(cached, 'second');
  writeRoomDocument(cached, file('First'), { schema, scope: first });
  writeRoomDocument(cached, file('Second'), { schema, scope: second });
  const confirmed = Y.encodeStateAsUpdate(cached);
  const vector = Y.encodeStateVector(cached);
  const offline = headlessEditor(readFixture(file('First')), { doc: cached, scope: first });
  let end = 0;
  offline.state.doc.descendants((node, pos) => {
    if (node.isText) end = pos + node.nodeSize;
  });
  offline.dispatch(offline.state.tr.insertText(' offline', end));
  const draft = {
    mode: 'room' as const,
    generation: 'old',
    state: Y.encodeStateAsUpdate(cached),
    unconfirmed: Y.encodeStateAsUpdate(cached, vector),
    confirmed,
    savedAt: '2026-01-01T00:00:00.000Z',
  };
  const current = new Y.Doc();
  const currentFirst = createRoomScope(current, 'first');
  const currentSecond = createRoomScope(current, 'second');
  writeRoomDocument(current, file('First'), { schema, scope: currentFirst });
  writeRoomDocument(current, file('Second new generation'), { schema, scope: currentSecond });
  const editor = headlessEditor(readFixture(file('First')), { doc: current, scope: currentFirst });
  const merged = mergeRoomDraft(editor.state, draft, { schema });
  expect(merged.leftovers).toEqual([]);
  expect(merged.transaction && textOf(merged.transaction.doc)).toBe('First offline');
  if (merged.transaction) editor.dispatch(merged.transaction);
  expect(readRoomDocument(current, { schema, scope: currentSecond })).toEqual(
    file('Second new generation'),
  );
  offline.destroy();
  editor.destroy();
  cached.destroy();
  current.destroy();
});
