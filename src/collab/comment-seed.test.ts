// @vitest-environment node
import * as Y from '@y/y';
import { describe, expect, it } from 'vitest';
import { type CommentThread, createMemoryHost } from '../host/index.js';
import { readRoomComments, writeRoomComments } from './comment-seed.js';
import { createRoomCommentStore } from './comment-store.js';
import { createRoomScope } from './room-scope.js';

// Stored threads as a host's store keeps them: a resolved suggestion with a reply and reactions, a
// thread deleted by a moderator, and an open one whose first comment was deleted.
const STORED: CommentThread[] = [
  {
    id: 't-1',
    state: 'resolved',
    quote: 'north beds',
    suggestion: 's-1',
    scope: 'text',
    target: {
      ranges: [{ element: 'p-1', start: 4, end: 14, text: 'north beds' }],
      quote: 'north beds',
    },
    author: 'ada',
    createdAt: '2026-01-02T09:00:00.000Z',
    updatedAt: '2026-01-03T10:00:00.000Z',
    resolvedBy: 'grace',
    resolvedAt: '2026-01-03T10:00:00.000Z',
    change: { kind: 'replace', inserted: 'south', deleted: 'north' },
    reactions: { '👍': ['grace'] },
    entries: [
      { id: 'e-1', author: 'ada', text: 'Swap these', createdAt: '2026-01-02T09:00:00.000Z' },
      {
        id: 'e-2',
        author: 'grace',
        text: 'Done',
        createdAt: '2026-01-03T09:30:00.000Z',
        editedAt: '2026-01-03T09:40:00.000Z',
        reactions: { '🎉': ['ada', 'linus'] },
      },
    ],
  },
  {
    id: 't-2',
    state: 'deleted',
    quote: 'paths',
    suggestion: null,
    author: 'linus',
    createdAt: '2026-01-04T08:00:00.000Z',
    updatedAt: '2026-01-04T08:00:00.000Z',
    deletedBy: 'grace',
    deletedAt: '2026-01-05T12:00:00.000Z',
    entries: [
      { id: 'e-3', author: 'linus', text: 'Wider?', createdAt: '2026-01-04T08:00:00.000Z' },
    ],
  },
  {
    id: 't-3',
    state: 'open',
    quote: '',
    suggestion: null,
    scope: 'document',
    author: 'grace',
    createdAt: '2026-01-06T08:00:00.000Z',
    updatedAt: '2026-01-06T08:00:00.000Z',
    entries: [
      {
        id: 'e-4',
        author: 'grace',
        text: 'Old note',
        createdAt: '2026-01-06T08:00:00.000Z',
        deletedBy: 'grace',
        deletedAt: '2026-01-06T09:00:00.000Z',
      },
    ],
  },
];

describe('room comment seeds', () => {
  it('DOCE-COLLAB-6.8 reads back the stored threads written into a room, authors and dates kept', () => {
    const doc = new Y.Doc();
    writeRoomComments(doc, STORED);
    expect(readRoomComments(doc)).toEqual(STORED);
  });

  it('DOCE-COLLAB-6.8 lists the seeded threads in the room comment store, which carries on from them', async () => {
    const doc = new Y.Doc();
    writeRoomComments(doc, STORED);
    const { identity } = createMemoryHost({ person: { id: 'ada', name: 'Ada' } });
    const store = createRoomCommentStore({
      doc,
      identity,
      now: () => new Date('2026-02-01T00:00:00Z'),
    });
    expect(await store.list('doc')).toEqual({ ok: true, value: STORED });
    await store.reply('doc', 't-3', 'New note');
    const [thread] = readRoomComments(doc).filter(({ id }) => id === 't-3');
    expect(thread?.entries.map(({ author, text }) => `${author}: ${text}`)).toEqual([
      'grace: Old note',
      'ada: New note',
    ]);
    expect(thread?.author).toBe('grace');
  });

  it('DOCE-COLLAB-6.8 refuses a room that holds threads already and writes nothing', () => {
    const doc = new Y.Doc();
    writeRoomComments(doc, STORED.slice(0, 1));
    expect(() => writeRoomComments(doc, STORED.slice(1))).toThrow(/already holds/);
    expect(readRoomComments(doc).map(({ id }) => id)).toEqual(['t-1']);
  });

  it('DOCE-COLLAB-6.8 writes and reads the threads of an embedded document field', () => {
    const doc = new Y.Doc();
    const scope = createRoomScope(doc, 'second');
    writeRoomComments(doc, STORED, { scope });
    expect(readRoomComments(doc)).toEqual([]);
    expect(readRoomComments(doc, { scope })).toEqual(STORED);
  });
});
