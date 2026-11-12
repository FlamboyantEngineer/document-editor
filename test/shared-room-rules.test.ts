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
import {
  type EditorCapabilities,
  FULL_CAPABILITIES,
  READ_ONLY_CAPABILITIES,
} from '../src/index.js';

// The write-rule recipe in docs/collaboration.md, on an in-process collaboration-tools room server.
const writeRules: RoomWriteRules = {
  required: { content: 'write-content', meta: 'write-meta', comments: 'write-comments' },
  otherwise: 'write-outside-layout',
};

function roomCapabilities({ edit, suggest, decide, comment }: EditorCapabilities): string[] {
  const capabilities: string[] = [];
  if (edit || suggest || decide) capabilities.push('write-content');
  if (edit) capabilities.push('write-meta');
  if (edit || suggest || decide || comment) capabilities.push('write-comments');
  return capabilities;
}

const READERS: Record<string, EditorCapabilities> = {
  editor: FULL_CAPABILITIES,
  suggester: { ...READ_ONLY_CAPABILITIES, suggest: true, comment: true },
  commenter: { ...READ_ONLY_CAPABILITIES, comment: true },
  decider: { ...READ_ONLY_CAPABILITIES, decide: true },
  reader: READ_ONLY_CAPABILITIES,
};

const providers: RoomProvider[] = [];
let closeServer: (() => Promise<void>) | null = null;

afterEach(async () => {
  for (const provider of providers.splice(0)) provider.destroy();
  await closeServer?.();
  closeServer = null;
});

function openRoom() {
  const server = createRoomServer({
    host: {
      permissions: { rulesFor: () => writeRules },
      auth: {
        admit: ({ token }) => {
          const id = token ?? 'reader';
          const capabilities = roomCapabilities(READERS[id] ?? READ_ONLY_CAPABILITIES);
          return Promise.resolve({
            ok: true,
            actor: { id },
            access: capabilities.length > 0 ? 'read-write' : 'read-only',
            capabilities,
          });
        },
      },
      persistence: createMemoryPersistence(),
    },
  });
  closeServer = () => server.close();
  const { createSocket } = connectToServer(server);
  const join = async (name: string) => {
    const provider = createRoomProvider({
      endpoint: 'ws://in-process.test/rooms',
      room: 'rules',
      doc: new Y.Doc(),
      getToken: () => name,
      createSocket,
    });
    providers.push(provider);
    await settled(provider, (state) => state.synced);
    return provider;
  };
  return { join };
}

function settled(
  provider: RoomProvider,
  done: (state: ReturnType<RoomProvider['getState']>) => boolean,
): Promise<void> {
  return new Promise((resolve) => {
    if (done(provider.getState())) {
      resolve();
      return;
    }
    const stop = provider.subscribe((state) => {
      if (done(state)) {
        stop();
        resolve();
      }
    });
  });
}

const confirmed = (provider: RoomProvider) =>
  settled(provider, (state) => state.synced && !state.hasUnconfirmedChanges);
const refusedWrite = (provider: RoomProvider) =>
  settled(provider, (state) => state.refusal === 'unauthorized-write');

describe('the shared room write rules', () => {
  it('DOCE-COLLAB-6.1 lets an editor write content, meta and comments', async () => {
    const room = openRoom();
    const editor = await room.join('editor');
    const other = await room.join('commenter');
    editor.doc.transact(() => {
      editor.doc.get('content').setAttr('title', 'Written');
      editor.doc.get('meta').setAttr('formatVersion', 1);
      editor.doc.get('comments').setAttr('thread-1', { body: 'A note' });
    });
    await confirmed(editor);
    await settled(other, () => other.doc.get('comments').getAttr('thread-1') !== undefined);
    expect(other.doc.get('meta').getAttr('formatVersion')).toBe(1);
    expect(editor.getState().refusal).toBeNull();
  });

  it('DOCE-COLLAB-6.1 lets a commenter write comments only', async () => {
    const room = openRoom();
    const editor = await room.join('editor');
    const commenter = await room.join('commenter');
    commenter.doc.get('comments').setAttr('thread-1', { body: 'A note' });
    await confirmed(commenter);
    await settled(editor, () => editor.doc.get('comments').getAttr('thread-1') !== undefined);

    commenter.doc.get('meta').setAttr('template', null);
    await refusedWrite(commenter);
    expect(editor.doc.get('meta').getAttr('template')).toBeUndefined();
  });

  it('DOCE-COLLAB-6.1 refuses a commenter writing content', async () => {
    const room = openRoom();
    const commenter = await room.join('commenter');
    commenter.doc.get('content').setAttr('title', 'Changed');
    await refusedWrite(commenter);
  });

  it('DOCE-COLLAB-6.1 lets a suggester write content and comments but not meta', async () => {
    const room = openRoom();
    const suggester = await room.join('suggester');
    suggester.doc.get('content').setAttr('title', 'Proposed');
    suggester.doc.get('comments').setAttr('thread-1', { body: 'Why' });
    await confirmed(suggester);
    suggester.doc.get('meta').setAttr('formatVersion', 1);
    await refusedWrite(suggester);
  });

  it('DOCE-COLLAB-6.1 lets a reader who decides on suggestions write content and comments', async () => {
    const room = openRoom();
    const decider = await room.join('decider');
    decider.doc.get('content').setAttr('title', 'Accepted');
    decider.doc.get('comments').setAttr('thread-1', { decision: 'accepted' });
    await confirmed(decider);
    decider.doc.get('meta').setAttr('formatVersion', 1);
    await refusedWrite(decider);
  });

  it('DOCE-COLLAB-6.1 refuses a type outside the layout and admits a reader read-only', async () => {
    const room = openRoom();
    const editor = await room.join('editor');
    const reader = await room.join('reader');
    expect(reader.getState().access).toBe('read-only');
    editor.doc.get('notes').setAttr('key', 'value');
    await refusedWrite(editor);
  });
});
