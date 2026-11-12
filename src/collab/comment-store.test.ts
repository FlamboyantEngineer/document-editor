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
import { afterEach, describe, expect, it } from 'vitest';
import { type CommentThread, createMemoryHost } from '../host/index.js';
import { createRoomCommentStore, readRoomThreads } from './comment-store.js';

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
