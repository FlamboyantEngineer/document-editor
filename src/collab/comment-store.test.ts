// @vitest-environment node
import {
  createRoomProvider,
  type RoomProvider,
} from '@flamboyantengineer/collaboration-tools/client';
import {
  createMemoryPersistence,
  createRoomServer,
  type RoomWriteRules,
} from '@flamboyantengineer/collaboration-tools/server';
import { connectToServer } from '@flamboyantengineer/collaboration-tools/testing';
import * as Y from '@y/y';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type CommentThread, createMemoryHost } from '../host/index.js';
import { readRoomThreads } from './comment-records.js';
import { createRoomCommentStore } from './comment-store.js';

// The write rules of docs/collaboration.md: a commenter may write the `comments` type only.
const writeRules: RoomWriteRules = {
  required: { content: 'write-content', meta: 'write-meta', comments: 'write-comments' },
  otherwise: 'write-outside-layout',
};
const CAPABILITIES: Record<string, string[]> = {
  editor: ['write-content', 'write-meta', 'write-comments'],
  commenter: ['write-comments'],
};

const providers: RoomProvider[] = [];
let closeServer: (() => Promise<void>) | null = null;

afterEach(async () => {
  for (const provider of providers.splice(0)) provider.destroy();
  await closeServer?.();
  closeServer = null;
});

// Resolves once `done` holds, checking as the provider's state or its document changes.
function settled(provider: RoomProvider, done: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    const check = () => {
      if (!done()) return;
      stop();
      provider.doc.off('update', check);
      resolve();
    };
    const stop = provider.subscribe(check);
    provider.doc.on('update', check);
    check();
  });
}

function openRoom() {
  const server = createRoomServer({
    host: {
      permissions: { rulesFor: () => writeRules },
      auth: {
        admit: ({ token }) =>
          Promise.resolve({
            ok: true,
            actor: { id: token ?? 'reader' },
            access: 'read-write',
            capabilities: CAPABILITIES[token ?? ''] ?? [],
          }),
      },
      persistence: createMemoryPersistence(),
    },
  });
  closeServer = () => server.close();
  const { createSocket } = connectToServer(server);
  return async (name: string) => {
    const provider = createRoomProvider({
      endpoint: 'ws://in-process.test/rooms',
      room: 'comments',
      doc: new Y.Doc(),
      getToken: () => name,
      createSocket,
    });
    providers.push(provider);
    await settled(provider, () => provider.getState().synced);
    const { identity } = createMemoryHost({ person: { id: name, name } });
    let ids = 0;
    const store = createRoomCommentStore({
      doc: provider.doc,
      identity,
      now: () => new Date('2026-01-02T03:04:05Z'),
      createId: () => `${name}-${String((ids += 1))}`,
    });
    return { provider, store };
  };
}

const confirmed = (provider: RoomProvider) =>
  settled(provider, () => !provider.getState().hasUnconfirmedChanges);

const value = <T>(result: { ok: true; value: T } | { ok: false }): T => {
  if (!result.ok) throw new Error('The store should take the change.');
  return result.value;
};

describe('createRoomCommentStore', () => {
  it('DOCE-COMMENTS-2.20 keeps a commenter’s threads in the room for every writer', async () => {
    const join = openRoom();
    const editor = await join('editor');
    const commenter = await join('commenter');
    const told: CommentThread[][] = [];
    const stop = editor.store.subscribe?.('doc', (threads) => told.push(threads));
    await commenter.store.create('doc', { id: 't1', quote: 'blue', text: 'Why blue?' });
    await commenter.store.reply('doc', 't1', 'Still asking');
    await confirmed(commenter.provider);
    expect(commenter.provider.getState().refusal).toBeNull();
    await settled(editor.provider, () => (told.at(-1)?.[0]?.entries.length ?? 0) === 2);
    expect(value(await editor.store.list('doc'))).toEqual([
      {
        id: 't1',
        quote: 'blue',
        suggestion: null,
        state: 'open',
        author: 'commenter',
        createdAt: '2026-01-02T03:04:05.000Z',
        updatedAt: '2026-01-02T03:04:05.000Z',
        entries: [
          {
            id: 'commenter-1',
            author: 'commenter',
            text: 'Why blue?',
            createdAt: '2026-01-02T03:04:05.000Z',
          },
          {
            id: 'commenter-2',
            author: 'commenter',
            text: 'Still asking',
            createdAt: '2026-01-02T03:04:05.000Z',
          },
        ],
      },
    ]);
    stop?.();
  });

  it('DOCE-COMMENTS-2.20 keeps replies and reactions two writers make at once', async () => {
    const join = openRoom();
    const editor = await join('editor');
    const commenter = await join('commenter');
    await editor.store.create('doc', { id: 't1', quote: 'blue', text: 'Start' });
    await confirmed(editor.provider);
    await settled(
      commenter.provider,
      () => readRoomThreads(commenter.provider.doc.get('comments')).length === 1,
    );
    await Promise.all([
      editor.store.reply('doc', 't1', 'From the editor'),
      commenter.store.reply('doc', 't1', 'From the commenter'),
      editor.store.react?.('doc', { threadId: 't1', emoji: '👍', reacted: true }),
      commenter.store.react?.('doc', { threadId: 't1', emoji: '👍', reacted: true }),
    ]);
    await Promise.all([confirmed(editor.provider), confirmed(commenter.provider)]);
    const both = () => readRoomThreads(editor.provider.doc.get('comments'))[0];
    await settled(editor.provider, () => both()?.entries.length === 3);
    expect(
      both()
        ?.entries.map((entry) => entry.text)
        .sort(),
    ).toEqual(['From the commenter', 'From the editor', 'Start']);
    expect(both()?.reactions).toEqual({ '👍': ['commenter', 'editor'] });
  });

  it('DOCE-COMMENTS-2.20 decides, resolves, edits and removes, refusing others’ comments', async () => {
    const join = openRoom();
    const editor = await join('editor');
    const { store } = editor;
    await store.create('doc', {
      id: 's1',
      quote: 'red',
      text: '',
      suggestion: 'sug-1',
      automatic: true,
    });
    await store.create('doc', { id: 't1', quote: 'blue', text: 'Mine' });
    expect(
      value((await store.update?.('doc', 's1', { quote: 'reds' })) ?? { ok: false }),
    ).toMatchObject({ quote: 'reds' });
    expect(
      value(
        (await store.decide?.('doc', {
          threadId: 's1',
          suggestion: 'sug-1',
          decision: 'accept',
        })) ?? {
          ok: false,
        },
      ),
    ).toMatchObject({
      state: 'resolved',
      resolvedBy: 'editor',
      decision: { decision: 'accept', suggestion: 'sug-1', by: 'editor' },
    });
    expect(
      value(
        (await store.edit?.('doc', { threadId: 't1', entryId: 'editor-1', text: 'Edited' })) ?? {
          ok: false,
        },
      ),
    ).toMatchObject({ entries: [{ text: 'Edited', editedAt: '2026-01-02T03:04:05.000Z' }] });
    const commenter = await join('commenter');
    await settled(
      commenter.provider,
      () => readRoomThreads(commenter.provider.doc.get('comments')).length === 2,
    );
    await expect(
      commenter.store.edit?.('doc', { threadId: 't1', entryId: 'editor-1', text: 'Hijack' }),
    ).resolves.toEqual({ ok: false, error: { kind: 'denied' } });
    await expect(store.create('doc', { id: 't1', quote: 'x', text: 'Again' })).resolves.toEqual({
      ok: false,
      error: { kind: 'conflict' },
    });
    await expect(store.remove('doc', 't1')).resolves.toEqual({ ok: true, value: null });
    expect(value(await store.list('doc')).map((thread) => thread.id)).toEqual(['s1']);
    await expect(store.reply('doc', 't1', 'Gone')).resolves.toMatchObject({
      ok: false,
      error: { kind: 'not-found' },
    });
  });
});

// Two writers' documents, which take each other's changes when asked, as a room relays them.
function writers() {
  const [first, second] = [new Y.Doc(), new Y.Doc()];
  const exchange = () => {
    Y.applyUpdate(second, Y.encodeStateAsUpdate(first, Y.encodeStateVector(second)));
    Y.applyUpdate(first, Y.encodeStateAsUpdate(second, Y.encodeStateVector(first)));
  };
  const storeOf = (doc: Y.Doc, name: string) => {
    let ids = 0;
    return createRoomCommentStore({
      doc,
      identity: createMemoryHost({ person: { id: name, name } }).identity,
      now: () => new Date('2026-01-02T03:04:05Z'),
      createId: () => `${name}-${String((ids += 1))}`,
    });
  };
  return { first, second, exchange, ada: storeOf(first, 'ada'), bea: storeOf(second, 'bea') };
}

const attribute = (doc: Y.Doc, key: readonly string[], record: unknown) =>
  doc.get('comments').setAttr(JSON.stringify(key), record);

// The names of the attributes the room keeps.
function attributeNames(doc: Y.Doc): string[] {
  const names: string[] = [];
  doc.get('comments').forEachAttr((_value: unknown, name: string | number) => {
    names.push(String(name));
  });
  return names.sort();
}

describe('readRoomThreads', () => {
  it('DOCE-COMMENTS-2.20 leaves out what is not a thread or a comment, keeping the rest', async () => {
    const { first, second, exchange, ada } = writers();
    const told: CommentThread[][] = [];
    ada.subscribe?.('doc', (threads) => told.push(threads));
    await ada.create('doc', { id: 't1', quote: 'blue', text: 'First' });
    exchange();
    // What another writer's document may hold: any value under any key.
    attribute(second, ['entry', 't1', 'no-fields'], { id: 'no-fields' });
    attribute(second, ['entry', 't1', 'not-a-record'], 'Second');
    attribute(second, ['thread', 'no-quote'], { id: 'no-quote', state: 'open' });
    attribute(second, ['thread', 'not-a-record'], 7);
    attribute(second, ['thread', 'renamed'], { id: 'another', quote: 'red', target: 'here' });
    exchange();
    const listed = value(await ada.list('doc'));
    expect(listed).toEqual([
      expect.objectContaining({ id: 't1', entries: [expect.objectContaining({ text: 'First' })] }),
      // A thread is the one its key names, whatever its record says.
      { id: 'renamed', quote: 'red', suggestion: null, state: 'open', entries: [] },
    ]);
    expect(told.at(-1)).toEqual(listed);
    expect(readRoomThreads(first.get('comments'))).toEqual(listed);
  });
  it('DOCE-COMMENTS-2.20 reads reactions under any emoji, even the names objects have', async () => {
    const { first, second, exchange, ada } = writers();
    await ada.create('doc', { id: 't1', quote: 'blue', text: 'First' });
    exchange();
    for (const emoji of ['constructor', '__proto__', 'toString'])
      attribute(second, ['reaction', 't1', '', emoji, 'bea'], true);
    exchange();
    const [thread] = readRoomThreads(first.get('comments'));
    expect(Object.entries(thread?.reactions ?? {})).toEqual([
      ['constructor', ['bea']],
      ['__proto__', ['bea']],
      ['toString', ['bea']],
    ]);
  });
});

describe('createRoomCommentStore, with changes made at once', () => {
  it('DOCE-COMMENTS-2.20 keeps a resolution, a decision and an update two writers make at once', async () => {
    const { exchange, ada, bea } = writers();
    await ada.create('doc', { id: 't1', quote: 'blue', text: '', suggestion: 's1' });
    await ada.create('doc', { id: 't2', quote: 'red', text: '', suggestion: 's2' });
    exchange();
    const change = { kind: 'insert', inserted: 'blue sky' } as const;
    await ada.update?.('doc', 't1', { quote: 'blue sky', change });
    await bea.setState('doc', 't1', 'resolved');
    await ada.update?.('doc', 't2', { quote: 'red rose' });
    await bea.decide?.('doc', { threadId: 't2', suggestion: 's2', decision: 'reject' });
    exchange();
    for (const store of [ada, bea]) {
      expect(value(await store.list('doc'))).toMatchObject([
        { id: 't1', quote: 'blue sky', change, state: 'resolved', resolvedBy: 'bea' },
        {
          id: 't2',
          quote: 'red rose',
          state: 'resolved',
          decision: { decision: 'reject', suggestion: 's2', by: 'bea' },
        },
      ]);
    }
  });

  it('DOCE-COMMENTS-2.20 keeps a thread removed while another writer changes it', async () => {
    const { second, exchange, ada, bea } = writers();
    await ada.create('doc', { id: 't1', quote: 'blue', text: 'First' });
    await ada.create('doc', { id: 't2', quote: 'red', text: 'Second' });
    exchange();
    await ada.remove('doc', 't1');
    await ada.remove('doc', 't2');
    await bea.setState('doc', 't1', 'resolved');
    await bea.reply('doc', 't1', 'Too late');
    // An earlier editor resolves by writing the thread's whole record again.
    attribute(second, ['thread', 't2'], { id: 't2', quote: 'red', state: 'resolved' });
    exchange();
    for (const store of [ada, bea]) expect(value(await store.list('doc'))).toEqual([]);
    await expect(bea.create('doc', { id: 't1', quote: 'blue', text: 'Again' })).resolves.toEqual({
      ok: false,
      error: { kind: 'conflict' },
    });
  });

  it('DOCE-COMMENTS-2.20 reads a thread an earlier editor kept as one record, and changes it', async () => {
    const { first, ada } = writers();
    const decision = {
      decision: 'accept',
      suggestion: 's1',
      by: 'cy',
      at: '2025-06-01T00:00:00.000Z',
    };
    attribute(first, ['thread', 'old'], {
      id: 'old',
      quote: 'blue',
      suggestion: 's1',
      state: 'resolved',
      resolvedBy: 'cy',
      resolvedAt: '2025-06-01T00:00:00.000Z',
      author: 'cy',
      createdAt: '2025-05-01T00:00:00.000Z',
      updatedAt: '2025-06-01T00:00:00.000Z',
      decision,
    });
    const [kept] = value(await ada.list('doc'));
    expect(kept).toMatchObject({ id: 'old', state: 'resolved', resolvedBy: 'cy', decision });
    const reopened = value(await ada.setState('doc', 'old', 'open'));
    expect(reopened).toMatchObject({
      state: 'open',
      decision,
      updatedAt: '2026-01-02T03:04:05.000Z',
    });
    expect(reopened).not.toHaveProperty('resolvedBy');
    expect(reopened).not.toHaveProperty('resolvedAt');
    expect(
      value((await ada.update?.('doc', 'old', { quote: 'blues' })) ?? { ok: false }),
    ).toMatchObject({ quote: 'blues', state: 'open' });
  });
});

describe('createRoomCommentStore, its comments', () => {
  it('DOCE-COMMENTS-2.20 removes a comment with the reactions to it', async () => {
    const { first, exchange, ada, bea } = writers();
    await ada.create('doc', { id: 't1', quote: 'blue', text: 'First' });
    exchange();
    await bea.reply('doc', 't1', 'Second');
    exchange();
    await ada.react?.('doc', { threadId: 't1', entryId: 'bea-1', emoji: '👍', reacted: true });
    await ada.react?.('doc', { threadId: 't1', entryId: 'ada-1', emoji: '🎉', reacted: true });
    exchange();
    await bea.removeEntry?.('doc', { threadId: 't1', entryId: 'bea-1' });
    exchange();
    expect(attributeNames(first)).toEqual([
      '["entry","t1","ada-1"]',
      '["reaction","t1","ada-1","🎉","ada"]',
      '["thread","t1"]',
    ]);
  });

  it('DOCE-COMMENTS-2.20 makes its own ids where the page is not a secure context', async () => {
    // Only a secure context has `crypto.randomUUID`.
    vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) });
    const doc = new Y.Doc();
    const { identity } = createMemoryHost({ person: { id: 'ada', name: 'Ada' } });
    const store = createRoomCommentStore({ doc, identity });
    await store.create('doc', { id: 't1', quote: 'blue', text: 'First' });
    const thread = value(await store.reply('doc', 't1', 'Second'));
    const ids = thread.entries.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(2);
    for (const id of ids) expect(id).toMatch(/^[\da-f]{32}$/);
  });
});
