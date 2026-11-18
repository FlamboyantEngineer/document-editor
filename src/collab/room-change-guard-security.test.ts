// @vitest-environment node
import { createRoomProvider } from '@flamboyantengineer/collaboration-tools/client';
import {
  createMemoryPersistence,
  createRoomServer,
} from '@flamboyantengineer/collaboration-tools/server';
import { connectToServer } from '@flamboyantengineer/collaboration-tools/testing';
import * as Y from '@y/y';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { type Command, EditorState, type Transaction } from 'prosemirror-state';
import { describe, expect, it, vi } from 'vitest';
import { headlessEditor, readFixture, undoManagerOf } from '../../test/collab-fixtures.js';
import { documentSchema as schema } from '../../test/document-markup.js';
import {
  caretAt,
  footnoteParts,
  footnoteState,
  note,
  paragraph,
  runCommand,
  text,
} from '../../test/footnote-fixtures.js';
import { insertFootnote, listFootnotes } from '../engine/footnotes.js';
import {
  acceptAllSuggestions,
  decideSuggestions,
  listSuggestions,
  rejectAllSuggestions,
} from '../engine/suggestion-decisions.js';
import { suggestTransaction } from '../engine/suggestions.js';
import { createMemoryHost } from '../host/index.js';
import { type DocumentFile, readDocumentFile } from '../model/index.js';
import { createFigure } from '../model/schema/caption-content.js';
import { createRoomCommentStore } from './comment-store.js';
import {
  documentToYjs,
  readRoomDocument,
  updateRoomDocument,
  writeRoomDocument,
  yjsToDocument,
} from './convert.js';
import { nodeToDelta, readContent } from './delta.js';
import { diffNodes } from './diff.js';
import { checkDocumentChange } from './guard-content.js';
import { openRoomChangeGuard, type RoomChangeGuardOptions } from './room-change-guard.js';
import { createRoomScope } from './room-scope.js';

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
const permissions = { edit: false, suggest: true, comment: true, decide: false };

// Where a new entry goes in the first footnote area: at its end.
function footnoteAreaPos(state: EditorState): number {
  let at = -1;
  state.doc.descendants((node, pos) => {
    if (at < 0 && node.type.name === 'page_footnotes') at = pos + node.nodeSize - 1;
    return at < 0;
  });
  return at;
}

async function setup(
  options: {
    fields?: boolean;
    empty?: boolean;
    pending?: boolean;
    granted?: typeof permissions;
    authorOf?: RoomChangeGuardOptions['authorOf'];
    resolvePermissions?: RoomChangeGuardOptions['permissions'];
  } = {},
) {
  const persistence = createMemoryPersistence();
  const server = createRoomServer({
    storeDebounceMs: 0,
    host: {
      persistence,
      auth: {
        admit: () =>
          Promise.resolve({
            ok: true,
            actor: { id: 'writer' },
            access: 'read-write',
            capabilities: ['suggest', 'comment'],
          }),
      },
      permissions: {
        rulesFor: () => ({
          openGuard: (doc) =>
            openRoomChangeGuard(doc, {
              schema,
              permissions: (actor, capabilities) =>
                options.resolvePermissions?.(actor, capabilities) ?? options.granted ?? permissions,
              authorOf: options.authorOf,
              scopes: options.fields
                ? [
                    createRoomScope(doc),
                    createRoomScope(doc, 'first'),
                    createRoomScope(doc, 'second'),
                  ]
                : undefined,
            }),
        }),
      },
      seeds: {
        seed: async () => {
          if (options.empty) return null;
          const seed = new Y.Doc();
          Y.applyUpdate(seed, documentToYjs(file('Original'), { schema }));
          if (options.pending)
            change(seed, (state) => {
              let start = 0;
              state.doc.descendants((node, pos) => {
                if (node.isText) start = pos;
              });
              const proposal = suggestTransaction(state.tr.insertText('X', start), state, {
                author: 'owner',
                newId: () => 'b0000001',
              });
              if (!proposal) throw new Error('Unsupported proposal.');
              return state.apply(proposal);
            });
          if (options.fields)
            for (const key of ['first', 'second'])
              writeRoomDocument(seed, file(key), { schema, scope: createRoomScope(seed, key) });
          const comments = createRoomCommentStore({
            doc: seed,
            identity: createMemoryHost({ person: { id: 'owner', name: 'Owner' } }).identity,
            createId: () => 'entry',
          });
          await comments.create('guard', {
            id: 'foreign',
            quote: 'Original',
            suggestion: options.pending ? 'b0000001' : null,
            text: 'Owned discussion',
          });
          const update = Y.encodeStateAsUpdate(seed);
          seed.destroy();
          return update;
        },
      },
    },
  });
  const sockets = connectToServer(server);
  const doc = new Y.Doc();
  const provider = createRoomProvider({
    endpoint: 'ws://test/rooms',
    room: 'guard',
    doc,
    createSocket: sockets.createSocket,
  });
  await vi.waitFor(() => expect(provider.getState().synced).toBe(true));
  const observerDoc = new Y.Doc();
  const observer = createRoomProvider({
    endpoint: 'ws://test/rooms',
    room: 'guard',
    doc: observerDoc,
    createSocket: sockets.createSocket,
  });
  await vi.waitFor(() => expect(observer.getState().synced).toBe(true));
  const handle = await server.openRoom('guard');
  const snapshots: Y.Doc[] = [];
  return {
    doc,
    provider,
    handle,
    server,
    persistence,
    observer,
    observerDoc,
    snapshot: () => {
      const copy = new Y.Doc();
      Y.applyUpdate(copy, handle.snapshot());
      snapshots.push(copy);
      return copy;
    },
    async close() {
      handle.release();
      provider.destroy();
      observer.destroy();
      observerDoc.destroy();
      await server.close();
      doc.destroy();
      for (const snapshot of snapshots) snapshot.destroy();
    },
  };
}

function change(doc: Y.Doc, action: (state: EditorState) => EditorState) {
  const held = readContent(schema, doc.get('content'));
  if (!held) throw new Error('Missing seeded content.');
  const next = action(EditorState.create({ doc: held }));
  doc.get('content').applyDelta(diffNodes(held, next.doc) as never);
}

describe('DOCE-COLLAB-7.2 authoritative document guard', () => {
  it('refuses raw text replacement before other readers or server persistence can observe it', async () => {
    const room = await setup();
    try {
      updateRoomDocument(room.doc, file('Unauthorized'), { schema });
      await room.provider.whenStored();
      expect(room.provider.getState().refusal).toBe('unauthorized-write');
      expect(yjsToDocument(room.handle.snapshot(), { schema })).toEqual(file('Original'));
      expect(await room.provider.whenStored()).toBe(false);
      expect(yjsToDocument(Y.encodeStateAsUpdate(room.observerDoc), { schema })).toEqual(
        file('Original'),
      );
      await room.server.flush();
      const stored = room.persistence.peek('guard');
      expect(stored && yjsToDocument(stored.update, { schema })).toEqual(file('Original'));
    } finally {
      await room.close();
    }
  });

  it('accepts attributed suggestions and their undo, while refusing an unauthorized decision', async () => {
    const room = await setup();
    try {
      const origin = {};
      const undo = new Y.UndoManager(room.doc.get('content'), {
        trackedOrigins: new Set([origin]),
        captureTimeout: 0,
      });
      room.doc.transact(
        () =>
          change(room.doc, (state) => {
            let pos = 0;
            state.doc.descendants((node, at) => {
              if (node.isText) pos = at + node.nodeSize;
            });
            const tr = suggestTransaction(state.tr.insertText(' proposed', pos), state, {
              author: 'writer',
              newId: () => 'suggestion',
            });
            if (!tr) throw new Error('Unsupported suggestion.');
            return state.apply(tr);
          }),
        origin,
      );
      await room.provider.whenStored();
      expect(room.provider.getState().refusal).toBeNull();
      expect(yjsToDocument(room.handle.snapshot(), { schema })?.sections).not.toEqual(
        file('Original').sections,
      );
      undo.undo();
      await room.provider.whenStored();
      expect(room.provider.getState().refusal).toBeNull();
      expect(yjsToDocument(room.handle.snapshot(), { schema })).toEqual(file('Original'));
      undo.redo();
      await room.provider.whenStored();
      const pending = readContent(schema, room.doc.get('content'));
      expect(pending && listSuggestions(pending)).toHaveLength(1);
      change(room.doc, (state) => {
        const tr = state.tr;
        decideSuggestions(tr, 'accept');
        expect(
          checkDocumentChange({ before: state.doc, after: tr.doc, actor: 'writer', permissions }),
        ).toBe(false);
        return state.apply(tr);
      });
      await room.provider.whenStored();
      expect(room.provider.getState().refusal).toBe('unauthorized-write');
      expect(yjsToDocument(room.handle.snapshot(), { schema })?.sections).not.toEqual(
        file('Original proposed').sections,
      );
      undo.destroy();
    } finally {
      await room.close();
    }
  });

  it('accepts owned discussion edits and rejects forged entry authorship', async () => {
    const room = await setup();
    try {
      const comments = createRoomCommentStore({
        doc: room.doc,
        identity: createMemoryHost({ person: { id: 'writer', name: 'Writer' } }).identity,
        createId: () => 'entry',
      });
      await comments.create('guard', { id: 'thread', quote: 'Original', text: 'Discussion' });
      await room.provider.whenStored();
      await comments.edit?.('guard', { threadId: 'thread', entryId: 'entry', text: 'Edited' });
      await room.provider.whenStored();
      expect(room.provider.getState().refusal).toBeNull();
      room.doc.get('comments').setAttr(JSON.stringify(['entry', 'thread', 'entry']), {
        id: 'entry',
        author: 'other',
        text: 'Forged',
        createdAt: '2026-01-01',
      });
      await room.provider.whenStored();
      expect(room.provider.getState().refusal).toBe('unauthorized-write');
      const stored = createRoomCommentStore({
        doc: room.snapshot(),
        identity: createMemoryHost({ person: { id: 'writer', name: 'Writer' } }).identity,
      });
      const threads = await stored.list('guard');
      expect(
        threads.ok &&
          threads.value
            .find((thread) => thread.id === 'thread')
            ?.entries.find((entry) => entry.id === 'entry')?.text,
      ).toBe('Edited');
    } finally {
      await room.close();
    }
  });

  it('DOCE-COMMENTS-2.27 refuses naming an assistant or keeping meta without the host’s grant', async () => {
    const room = await setup();
    try {
      room.doc.get('comments').setAttr(JSON.stringify(['entry', 'foreign', 'mine']), {
        id: 'mine',
        author: 'writer',
        text: 'Reply',
        createdAt: '2026-01-02',
        agent: 'helper',
      });
      await room.provider.whenStored();
      expect(room.provider.getState().refusal).toBe('unauthorized-write');
    } finally {
      await room.close();
    }
  });

  it('DOCE-COMMENTS-2.27 accepts the assistant and meta of a thread the host lets label, refusing malformed meta', async () => {
    const room = await setup({
      resolvePermissions: () => ({ ...permissions, labelAgents: true }),
    });
    try {
      const comments = createRoomCommentStore({
        doc: room.doc,
        identity: createMemoryHost({ person: { id: 'writer', name: 'Writer' } }).identity,
        createId: () => 'entry',
      });
      await comments.create('guard', {
        id: 'thread',
        quote: 'Original',
        text: 'Discussion',
        agent: 'helper',
        meta: { review: 'pending' },
      });
      await room.provider.whenStored();
      expect(room.provider.getState().refusal).toBeNull();
      room.doc.get('comments').setAttr(JSON.stringify(['entry', 'thread', 'second']), {
        id: 'second',
        author: 'writer',
        text: 'More',
        createdAt: '2026-01-01',
        meta: 'not a record',
      });
      await room.provider.whenStored();
      expect(room.provider.getState().refusal).toBe('unauthorized-write');
    } finally {
      await room.close();
    }
  });
});

const attackCases: readonly [string, (doc: Y.Doc) => void][] = [
  [
    'foreign thread tombstone',
    (doc) => doc.get('comments').setAttr(JSON.stringify(['removed', 'foreign']), true),
  ],
  [
    'foreign thread deletion',
    (doc) =>
      doc
        .get('comments')
        .setAttr(JSON.stringify(['removed', 'foreign']), { by: 'writer', at: '2026-01-01' }),
  ],
  [
    'foreign comment deletion',
    (doc) =>
      doc.get('comments').setAttr(JSON.stringify(['entry', 'foreign', 'entry']), {
        ...(doc.get('comments').getAttr(JSON.stringify(['entry', 'foreign', 'entry'])) as object),
        deletedBy: 'writer',
        deletedAt: '2026-01-01',
      }),
  ],
  [
    'comment taken out',
    (doc) => doc.get('comments').deleteAttr(JSON.stringify(['entry', 'foreign', 'entry'])),
  ],
  [
    'foreign quote',
    (doc) =>
      doc
        .get('comments')
        .setAttr(JSON.stringify(['quote', 'foreign']), { value: 'Changed', at: '2026-01-01' }),
  ],
  [
    'foreign target',
    (doc) =>
      doc
        .get('comments')
        .setAttr(JSON.stringify(['target', 'foreign']), { value: null, at: '2026-01-01' }),
  ],
  [
    'foreign change',
    (doc) =>
      doc.get('comments').setAttr(JSON.stringify(['change', 'foreign']), {
        value: { kind: 'delete' },
        at: '2026-01-01',
      }),
  ],
  [
    'foreign reaction identity',
    (doc) =>
      doc
        .get('comments')
        .setAttr(JSON.stringify(['reaction', 'foreign', 'entry', 'like', 'owner']), true),
  ],
  [
    'forged decision',
    (doc) =>
      doc.get('comments').setAttr(JSON.stringify(['decision', 'foreign']), {
        decision: 'accept',
        suggestion: 'suggestion',
        by: 'writer',
        at: '2026-01-01',
      }),
  ],
  [
    'dangling entry',
    (doc) =>
      doc.get('comments').setAttr(JSON.stringify(['entry', 'missing', 'dangling']), {
        author: 'writer',
        text: 'Dangling',
        createdAt: '2026-01-01',
      }),
  ],
  [
    'foreign entry deletion',
    (doc) => doc.get('comments').deleteAttr(JSON.stringify(['entry', 'foreign', 'entry'])),
  ],
  [
    'foreign entry attribution',
    (doc) =>
      doc.get('comments').setAttr(JSON.stringify(['entry', 'foreign', 'entry']), {
        author: 'writer',
        text: 'Forged',
        createdAt: '2026-01-01',
      }),
  ],
  [
    'unkeyed foreign insertion',
    (doc) =>
      change(doc, (state) => {
        let start = 0;
        state.doc.descendants((node, pos) => {
          if (node.isText) start = pos;
        });
        const insertion = state.schema.marks.insertion;
        if (!insertion) throw new Error('Missing insertion.');
        return state.apply(
          state.tr.addMark(start, start + 3, insertion.create({ dataAuthor: 'other' })),
        );
      }),
  ],
  ['hidden comments sequence', (doc) => doc.get('comments').insert(0, 'Hidden')],
  ['hidden metadata sequence', (doc) => doc.get('meta').insert(0, 'Hidden')],
  [
    'unknown content attribute',
    (doc) => doc.get('content').setAttr('hidden', { arbitrary: 'data' }),
  ],
  ['unconfigured root', (doc) => doc.get('other').setAttr('value', 'Unvalidated')],
];

it.each(attackCases)(
  'DOCE-COLLAB-7.2 refuses raw %s before authoritative discussion changes',
  async (_name, attack) => {
    const room = await setup();
    try {
      const identity = createMemoryHost({ person: { id: 'owner', name: 'Owner' } }).identity;
      const source = createRoomCommentStore({
        doc: room.snapshot(),
        identity,
        createId: () => 'entry',
      });
      const before = await source.list('guard');
      attack(room.doc);
      await room.provider.whenStored();
      expect(room.provider.getState().refusal).toBe('unauthorized-write');
      const current = createRoomCommentStore({ doc: room.snapshot(), identity });
      expect(await current.list('guard')).toEqual(before);
      expect(room.snapshot().get('other').getAttr('value')).toBeUndefined();
    } finally {
      await room.close();
    }
  },
);

it('DOCE-COLLAB-7.2 permits an owned thread deletion, which keeps the thread and its replies', async () => {
  const room = await setup();
  try {
    const comments = createRoomCommentStore({
      doc: room.doc,
      identity: createMemoryHost({ person: { id: 'writer', name: 'Writer' } }).identity,
      createId: () => 'mine',
    });
    await comments.create('guard', { id: 'mine', quote: 'Original', text: 'Discussion' });
    await room.provider.whenStored();
    room.handle.transact({ actor: { id: 'owner' }, capabilities: ['comment'] }, (doc) => {
      const store = createRoomCommentStore({
        doc,
        identity: createMemoryHost({ person: { id: 'owner', name: 'Owner' } }).identity,
        createId: () => 'reply',
      });
      void store.reply('guard', { threadId: 'mine', text: 'Reply' });
    });
    await vi.waitFor(() =>
      expect(
        room.doc.get('comments').getAttr(JSON.stringify(['entry', 'mine', 'reply'])),
      ).toBeDefined(),
    );
    await comments.remove('guard', 'mine');
    await room.provider.whenStored();
    expect(room.provider.getState().refusal).toBeNull();
    const remaining = await createRoomCommentStore({
      doc: room.snapshot(),
      identity: createMemoryHost().identity,
    }).list('guard');
    const deleted = remaining.ok ? remaining.value.find((thread) => thread.id === 'mine') : null;
    expect(deleted).toMatchObject({ state: 'deleted', deletedBy: 'writer' });
    expect(deleted?.entries.map((entry) => entry.text)).toEqual(['Discussion', 'Reply']);
  } finally {
    await room.close();
  }
});

it('DOCE-COLLAB-7.1 shares two independently editable fields over one real room provider', async () => {
  const room = await setup({
    fields: true,
    granted: { edit: true, suggest: true, comment: true, decide: true },
  });
  const first = createRoomScope(room.doc, 'first');
  const second = createRoomScope(room.doc, 'second');
  const a = headlessEditor(readFixture(file('first')), { doc: room.doc, scope: first });
  const b = headlessEditor(readFixture(file('second')), { doc: room.doc, scope: second });
  const undo = undoManagerOf(a);
  try {
    const end = (editor: typeof a) => {
      let found = 0;
      editor.state.doc.descendants((node, pos) => {
        if (node.isText) found = pos + node.nodeSize;
      });
      return found;
    };
    a.dispatch(a.state.tr.insertText(' A', end(a)));
    b.dispatch(b.state.tr.insertText(' B', end(b)));
    await room.provider.whenStored();
    expect(
      readRoomDocument(room.observerDoc, {
        schema,
        scope: createRoomScope(room.observerDoc, 'first'),
      }),
    ).toEqual(file('first A'));
    expect(
      readRoomDocument(room.observerDoc, {
        schema,
        scope: createRoomScope(room.observerDoc, 'second'),
      }),
    ).toEqual(file('second B'));
    undo.undo();
    await room.provider.whenStored();
    expect(
      readRoomDocument(room.observerDoc, {
        schema,
        scope: createRoomScope(room.observerDoc, 'first'),
      }),
    ).toEqual(file('first'));
    const identity = createMemoryHost({ person: { id: 'writer', name: 'Writer' } }).identity;
    await createRoomCommentStore({ doc: room.doc, scope: first, identity }).create('first', {
      id: 'discussion',
      quote: 'first',
      text: 'Field discussion',
    });
    await room.provider.whenStored();
    expect(
      await createRoomCommentStore({
        doc: room.observerDoc,
        scope: createRoomScope(room.observerDoc, 'second'),
        identity,
      }).list('second'),
    ).toEqual({ ok: true, value: [] });
    a.destroy();
    b.dispatch(b.state.tr.insertText('!', end(b)));
    await room.provider.whenStored();
    expect(
      readRoomDocument(room.observerDoc, {
        schema,
        scope: createRoomScope(room.observerDoc, 'second'),
      }),
    ).toEqual(file('second B!'));
    expect(room.provider.getState().refusal).toBeNull();
  } finally {
    undo.destroy();
    a.destroy();
    b.destroy();
    await room.close();
  }
});

it('DOCE-COLLAB-7.2 accepts an authorized first document in an empty room', async () => {
  const room = await setup({
    empty: true,
    granted: { edit: true, suggest: false, comment: false, decide: false },
  });
  try {
    updateRoomDocument(room.doc, file('First document'), { schema });
    await room.provider.whenStored();
    expect(room.provider.getState().refusal).toBeNull();
    expect(yjsToDocument(room.handle.snapshot(), { schema })).toEqual(file('First document'));
  } finally {
    await room.close();
  }
});

it('DOCE-COLLAB-7.2 rejects unkeyed foreign attribution even for a direct editor', async () => {
  const room = await setup({
    granted: { edit: true, suggest: true, comment: true, decide: false },
  });
  try {
    change(room.doc, (state) => {
      let start = 0;
      state.doc.descendants((node, pos) => {
        if (node.isText) start = pos;
      });
      const mark = state.schema.marks.insertion;
      if (!mark) throw new Error('Missing insertion.');
      return state.apply(state.tr.addMark(start, start + 3, mark.create({ dataAuthor: 'other' })));
    });
    await room.provider.whenStored();
    expect(room.provider.getState().refusal).toBe('unauthorized-write');
    expect(yjsToDocument(room.handle.snapshot(), { schema })).toEqual(file('Original'));
  } finally {
    await room.close();
  }
});

it('DOCE-COLLAB-7.2 refuses raw relocation of another authenticated author proposal', async () => {
  const room = await setup();
  try {
    expect(
      room.handle.transact({ actor: { id: 'owner' }, capabilities: ['suggest'] }, (doc) =>
        change(doc, (state) => {
          let start = 0;
          state.doc.descendants((node, pos) => {
            if (node.isText) start = pos;
          });
          const proposal = suggestTransaction(state.tr.insertText('X', start), state, {
            author: 'owner',
            newId: () => 'b0000001',
          });
          if (!proposal) throw new Error('Unsupported proposal.');
          return state.apply(proposal);
        }),
      ),
    ).toBe(true);
    await vi.waitFor(() => {
      const held = readContent(schema, room.doc.get('content'));
      expect(held && listSuggestions(held)).toHaveLength(1);
    });
    const before = yjsToDocument(room.handle.snapshot(), { schema });
    change(room.doc, (state) => {
      let at = 0;
      state.doc.descendants((node, pos) => {
        if (node.isText && node.text === 'X') at = pos;
      });
      const mark = state.doc.nodeAt(at)?.marks.find((each) => each.type.name === 'insertion');
      if (!mark) throw new Error('Missing proposal.');
      return state.apply(
        state.tr
          .delete(at, at + 1)
          .insertText('X', at + 1)
          .addMark(at + 1, at + 2, mark),
      );
    });
    await room.provider.whenStored();
    expect(room.provider.getState().refusal).toBe('unauthorized-write');
    expect(yjsToDocument(room.handle.snapshot(), { schema })).toEqual(before);
  } finally {
    await room.close();
  }
});

it.each([
  { author: 'other', suggest: true },
  { author: 'writer', suggest: false },
])(
  'DOCE-COLLAB-7.2 validates first-document proposal attribution and independent permission: %j',
  async ({ author, suggest }) => {
    const room = await setup({
      empty: true,
      granted: { edit: true, suggest, comment: false, decide: false },
    });
    try {
      const state = EditorState.create({ doc: readFixture(file('First')) });
      let start = 0;
      state.doc.descendants((node, pos) => {
        if (node.isText) start = pos;
      });
      const insertion = state.schema.marks.insertion;
      if (!insertion) throw new Error('Missing insertion.');
      const marked = state.tr.addMark(
        start,
        start + 3,
        insertion.create({ dataId: 'b0000001', dataAuthor: author }),
      ).doc;
      room.doc.get('content').applyDelta(nodeToDelta(marked) as never);
      await room.provider.whenStored();
      expect(room.provider.getState().refusal).toBe('unauthorized-write');
      expect(yjsToDocument(room.handle.snapshot(), { schema })).toBeNull();
    } finally {
      await room.close();
    }
  },
);

it('DOCE-COLLAB-7.2 keeps edit and suggest independent in a populated room', async () => {
  const room = await setup({
    granted: { edit: true, suggest: false, comment: false, decide: false },
  });
  try {
    updateRoomDocument(room.doc, file('Direct update'), { schema });
    await room.provider.whenStored();
    expect(room.provider.getState().refusal).toBeNull();
    change(room.doc, (state) => {
      let start = 0;
      state.doc.descendants((node, pos) => {
        if (node.isText) start = pos;
      });
      const proposal = suggestTransaction(state.tr.insertText('Own ', start), state, {
        author: 'writer',
        newId: () => 'c0000001',
      });
      if (!proposal) throw new Error('Unsupported proposal.');
      return state.apply(proposal);
    });
    await room.provider.whenStored();
    expect(room.provider.getState().refusal).toBe('unauthorized-write');
    expect(yjsToDocument(room.handle.snapshot(), { schema })).toEqual(file('Direct update'));
  } finally {
    await room.close();
  }
});

it('DOCE-COLLAB-7.2 permits an explicit decision without edit or suggest', async () => {
  const room = await setup({
    pending: true,
    granted: { edit: false, suggest: false, comment: false, decide: true },
  });
  try {
    change(room.doc, (state) => {
      const tr = state.tr;
      decideSuggestions(tr, 'accept');
      return state.apply(tr);
    });
    await room.provider.whenStored();
    expect(room.provider.getState().refusal).toBeNull();
    const discussions = createRoomCommentStore({
      doc: room.doc,
      identity: createMemoryHost({ person: { id: 'writer', name: 'Writer' } }).identity,
    });
    await discussions.decide?.('guard', {
      threadId: 'foreign',
      suggestion: 'b0000001',
      decision: 'accept',
    });
    await room.provider.whenStored();
    expect(room.provider.getState().refusal).toBeNull();
    const content = readContent(schema, room.snapshot().get('content'));
    expect(content && listSuggestions(content)).toEqual([]);
    expect(content?.textBetween(0, content.content.size)).toBe('XOriginal');
  } finally {
    await room.close();
  }
});

it('DOCE-COLLAB-7.2 validates protected proposals when raw removal empties content', async () => {
  const room = await setup({
    pending: true,
    granted: { edit: true, suggest: false, comment: false, decide: false },
  });
  try {
    const before = yjsToDocument(room.handle.snapshot(), { schema });
    const content = room.doc.get('content');
    content.delete(0, content.length);
    await room.provider.whenStored();
    expect(room.provider.getState().refusal).toBe('unauthorized-write');
    expect(yjsToDocument(room.handle.snapshot(), { schema })).toEqual(before);
  } finally {
    await room.close();
  }
});

it('DOCE-COLLAB-7.2 refuses inserted foreign attribution hidden behind an own proposal ID', async () => {
  const room = await setup();
  try {
    change(room.doc, (state) => {
      let start = 0;
      state.doc.descendants((node, pos) => {
        if (node.isText) start = pos;
      });
      const insertion = state.schema.marks.insertion;
      if (!insertion) throw new Error('Missing insertion.');
      const own = insertion.create({ dataId: 'b0000001', dataAuthor: 'writer' });
      const foreign = insertion.create({ dataId: 'b0000001', dataAuthor: 'other' });
      const tr = state.tr
        .insertText('AB', start)
        .addMark(start, start + 1, own)
        .addMark(start + 1, start + 2, foreign);
      return state.apply(tr);
    });
    await room.provider.whenStored();
    expect(room.provider.getState().refusal).toBe('unauthorized-write');
    expect(yjsToDocument(room.handle.snapshot(), { schema })).toEqual(file('Original'));
  } finally {
    await room.close();
  }
});

it('DOCE-COLLAB-7.2 uses trusted suggestion author mapping without changing discussion ownership', async () => {
  const room = await setup({ authorOf: (actor) => `person:${actor.id}` });
  try {
    change(room.doc, (state) => {
      let start = 0;
      state.doc.descendants((node, pos) => {
        if (node.isText) start = pos;
      });
      const tr = suggestTransaction(state.tr.insertText('Mapped ', start), state, {
        author: 'person:writer',
        newId: () => 'b0000001',
      });
      if (!tr) throw new Error('Unsupported proposal.');
      return state.apply(tr);
    });
    await room.provider.whenStored();
    expect(room.provider.getState().refusal).toBeNull();
    const store = createRoomCommentStore({
      doc: room.doc,
      identity: createMemoryHost({ person: { id: 'writer', name: 'Writer' } }).identity,
      createId: () => 'mapped-entry',
    });
    await store.create('guard', { id: 'mapped-thread', quote: 'Original', text: 'Owned' });
    await room.provider.whenStored();
    const key = JSON.stringify(['entry', 'mapped-thread', 'mapped-entry']);
    const entry = room.doc.get('comments').getAttr(key) as Record<string, unknown>;
    expect(entry.author).toBe('writer');
    room.doc.get('comments').setAttr(key, { ...entry, author: 'person:writer' });
    await room.provider.whenStored();
    expect(room.provider.getState().refusal).toBe('unauthorized-write');
  } finally {
    await room.close();
  }
});

it('DOCE-COLLAB-7.2 null author mapping denies authoring without actor-id fallback', async () => {
  const room = await setup({
    authorOf: () => null,
    granted: { edit: true, suggest: true, comment: true, decide: true },
  });
  try {
    change(room.doc, (state) => {
      let start = 0;
      state.doc.descendants((node, pos) => {
        if (node.isText) start = pos;
      });
      const tr = suggestTransaction(state.tr.insertText('Denied ', start), state, {
        author: 'writer',
        newId: () => 'b0000001',
      });
      if (!tr) throw new Error('Unsupported proposal.');
      return state.apply(tr);
    });
    await room.provider.whenStored();
    expect(room.provider.getState().refusal).toBe('unauthorized-write');
  } finally {
    await room.close();
  }
});

it('DOCE-COLLAB-7.2 null author mapping keeps explicit decisions and actor-owned discussions available', async () => {
  const room = await setup({
    pending: true,
    authorOf: () => null,
    granted: { edit: false, suggest: false, comment: true, decide: true },
  });
  try {
    change(room.doc, (state) => {
      const tr = state.tr;
      decideSuggestions(tr, 'accept');
      return state.apply(tr);
    });
    const store = createRoomCommentStore({
      doc: room.doc,
      identity: createMemoryHost({ person: { id: 'writer', name: 'Writer' } }).identity,
    });
    await store.create('guard', { id: 'actor-thread', quote: 'Original', text: 'Allowed' });
    await room.provider.whenStored();
    expect(room.provider.getState().refusal).toBeNull();
    const threads = await store.list('guard');
    expect(threads.ok && threads.value.find((thread) => thread.id === 'actor-thread')?.author).toBe(
      'writer',
    );
  } finally {
    await room.close();
  }
});

it('DOCE-COLLAB-7.2 privileged attributed restore preserves foreign proposals without granting clients the exception', async () => {
  const resolvePermissions: RoomChangeGuardOptions['permissions'] = (_actor, held) => ({
    edit: held.has('edit'),
    suggest: held.has('suggest'),
    comment: held.has('comment'),
    decide: held.has('decide'),
    manageProposals: held.has('manage-proposals'),
  });
  const room = await setup({ resolvePermissions });
  try {
    const restored = room.handle.transact(
      {
        actor: { id: 'restore-service' },
        capabilities: ['edit', 'suggest', 'decide', 'manage-proposals'],
      },
      (doc) =>
        change(doc, (state) => {
          let start = 0;
          state.doc.descendants((node, pos) => {
            if (node.isText) start = pos;
          });
          const tr = suggestTransaction(state.tr.insertText('Restored ', start), state, {
            author: 'historical-author',
            newId: () => 'b0000001',
          });
          if (!tr) throw new Error('Unsupported proposal.');
          return state.apply(tr);
        }),
    );
    expect(restored).toBe(true);
    await vi.waitFor(() => {
      const held = readContent(schema, room.doc.get('content'));
      expect(held && listSuggestions(held)[0]?.author).toBe('historical-author');
    });
    change(room.doc, (state) => {
      let end = 0;
      state.doc.descendants((node, pos) => {
        if (node.isText) end = pos + node.nodeSize;
      });
      const tr = suggestTransaction(state.tr.insertText(' Spoofed', end), state, {
        author: 'another-author',
        newId: () => 'c0000001',
      });
      if (!tr) throw new Error('Unsupported proposal.');
      return state.apply(tr);
    });
    await room.provider.whenStored();
    expect(room.provider.getState().refusal).toBe('unauthorized-write');
    const held = readContent(schema, room.snapshot().get('content'));
    expect(held && listSuggestions(held).map((each) => each.author)).toEqual(['historical-author']);
  } finally {
    await room.close();
  }
});

it('DOCE-COLLAB-7.2 refuses a foreign block-format author hidden behind an own proposal ID', async () => {
  const room = await setup({
    granted: { edit: true, suggest: true, comment: true, decide: false },
  });
  try {
    const base = file('Original');
    updateRoomDocument(
      room.doc,
      {
        ...base,
        sections: base.sections.map((section) => ({
          ...section,
          content: [
            ...section.content,
            {
              type: 'paragraph',
              attrs: { id: 'a0000002' },
              content: [{ type: 'text', text: 'Second' }],
            },
          ],
        })),
      },
      { schema },
    );
    await room.provider.whenStored();
    expect(room.provider.getState().refusal).toBeNull();
    change(room.doc, (state) => {
      const positions: number[] = [];
      state.doc.descendants((node, pos) => {
        if (node.type.name === 'paragraph') positions.push(pos);
      });
      const first = positions[0];
      const second = positions[1];
      if (first === undefined || second === undefined) throw new Error('Missing paragraphs.');
      const tr = state.tr
        .setNodeAttribute(first, 'suggestionFormat', {
          id: 'b0000001',
          author: 'writer',
          type: 'paragraph',
          attrs: {},
        })
        .setNodeAttribute(second, 'suggestionFormat', {
          id: 'b0000001',
          author: 'other',
          type: 'paragraph',
          attrs: {},
        });
      return state.apply(tr);
    });
    await room.provider.whenStored();
    expect(room.provider.getState().refusal).toBe('unauthorized-write');
  } finally {
    await room.close();
  }
});

it('DOCE-COMMENTS-2.30 refuses deleting a reply that is not the last left, and keeps a deleted one', async () => {
  const room = await setup();
  try {
    let ids = 0;
    const comments = createRoomCommentStore({
      doc: room.doc,
      identity: createMemoryHost({ person: { id: 'writer', name: 'Writer' } }).identity,
      createId: () => `c${String((ids += 1))}`,
    });
    await comments.create('guard', { id: 'mine', quote: 'Original', text: 'Discussion' });
    await comments.reply('guard', { threadId: 'mine', text: 'First' });
    await comments.reply('guard', { threadId: 'mine', text: 'Second' });
    await room.provider.whenStored();
    const name = JSON.stringify(['entry', 'mine', 'c2']);
    const first = room.doc.get('comments').getAttr(name) as object;
    room.doc
      .get('comments')
      .setAttr(name, { ...first, deletedBy: 'writer', deletedAt: '2026-01-02' });
    await room.provider.whenStored();
    expect(room.provider.getState().refusal).toBe('unauthorized-write');
  } finally {
    await room.close();
  }
});

it('DOCE-COMMENTS-2.31 lets a moderator delete another person’s comment, kept as a record', async () => {
  const room = await setup({
    resolvePermissions: () => ({ ...permissions, manageComments: true }),
  });
  try {
    const comments = createRoomCommentStore({
      doc: room.doc,
      identity: createMemoryHost({ person: { id: 'writer', name: 'Writer' } }).identity,
      moderates: true,
    });
    await expect(
      comments.removeEntry?.('guard', { threadId: 'foreign', entryId: 'entry' }),
    ).resolves.toMatchObject({ ok: true });
    await comments.remove('guard', 'foreign');
    await room.provider.whenStored();
    expect(room.provider.getState().refusal).toBeNull();
    const stored = await createRoomCommentStore({
      doc: room.snapshot(),
      identity: createMemoryHost().identity,
    }).list('guard');
    const thread = stored.ok ? stored.value.find((each) => each.id === 'foreign') : null;
    expect(thread).toMatchObject({ state: 'deleted', deletedBy: 'writer' });
    expect(thread?.entries[0]).toMatchObject({ text: 'Owned discussion', deletedBy: 'writer' });
  } finally {
    await room.close();
  }
});

it('DOCE-COMMENTS-2.30 accepts deleting the last reply left, kept with its text', async () => {
  const room = await setup();
  try {
    let ids = 0;
    const comments = createRoomCommentStore({
      doc: room.doc,
      identity: createMemoryHost({ person: { id: 'writer', name: 'Writer' } }).identity,
      createId: () => `c${String((ids += 1))}`,
    });
    await comments.create('guard', { id: 'mine', quote: 'Original', text: 'Discussion' });
    await comments.reply('guard', { threadId: 'mine', text: 'First' });
    await comments.react?.('guard', {
      threadId: 'mine',
      entryId: 'c2',
      emoji: 'ok',
      reacted: true,
    });
    await comments.removeEntry?.('guard', { threadId: 'mine', entryId: 'c2' });
    await room.provider.whenStored();
    expect(room.provider.getState().refusal).toBeNull();
    const stored = await createRoomCommentStore({
      doc: room.snapshot(),
      identity: createMemoryHost().identity,
    }).list('guard');
    const thread = stored.ok ? stored.value.find((each) => each.id === 'mine') : null;
    expect(thread?.entries[1]).toMatchObject({ text: 'First', deletedBy: 'writer' });
    expect(thread?.entries[1]?.reactions).toBeUndefined();
  } finally {
    await room.close();
  }
});

it('DOCE-COMMENTS-2.32 refuses taking another person’s reaction from a comment deleted before', async () => {
  const room = await setup();
  try {
    let ids = 0;
    const comments = createRoomCommentStore({
      doc: room.doc,
      identity: createMemoryHost({ person: { id: 'writer', name: 'Writer' } }).identity,
      createId: () => `c${String((ids += 1))}`,
    });
    await comments.create('guard', { id: 'mine', quote: 'Original', text: 'Discussion' });
    await comments.reply('guard', { threadId: 'mine', text: 'First' });
    await room.provider.whenStored();
    const reaction = JSON.stringify(['reaction', 'mine', 'c2', 'ok', 'owner']);
    room.handle.transact({ actor: { id: 'owner' }, capabilities: ['comment'] }, (doc) => {
      doc.get('comments').setAttr(reaction, true);
    });
    await vi.waitFor(() => expect(room.doc.get('comments').getAttr(reaction)).toBe(true));
    const name = JSON.stringify(['entry', 'mine', 'c2']);
    // Deleted without its reactions, as another editor might, then the reaction taken later.
    room.doc.get('comments').setAttr(name, {
      ...(room.doc.get('comments').getAttr(name) as object),
      deletedBy: 'writer',
      deletedAt: '2026-01-02',
    });
    await room.provider.whenStored();
    expect(room.provider.getState().refusal).toBeNull();
    room.doc.get('comments').deleteAttr(reaction);
    await room.provider.whenStored();
    expect(room.provider.getState().refusal).toBe('unauthorized-write');
  } finally {
    await room.close();
  }
});

describe('DOCE-COLLAB-6.6 DOCE-COLLAB-7.2 DOCE-SUGGESTIONS-1.5 a suggested footnote in a guarded room', () => {
  const suggestOnly = { edit: false, suggest: true, comment: true, decide: false };
  const decider = { edit: false, suggest: true, comment: true, decide: true };
  const start = () =>
    caretAt(footnoteState([paragraph(text('Before after.'), note('n1', 'Old'))]), 'after', -1);
  // Runs a command as the writer suggesting it.
  const suggestAs = (state: EditorState, command: Command, author = 'writer') => {
    let next = state;
    command(state, (tr) => {
      const id = author === 'writer' ? 's0000001' : 's0000002';
      const rewritten = suggestTransaction(tr, state, { author, newId: () => id });
      if (!rewritten) throw new Error('The change was not suggested.');
      next = state.apply(rewritten);
    });
    return next;
  };
  const typeText: (value: string) => Command = (value) => (state, dispatch) => {
    dispatch?.(state.tr.insertText(value));
    return true;
  };
  const allowed = (
    before: EditorState,
    after: { doc: EditorState['doc'] },
    actor: string,
    granted = suggestOnly,
  ) => checkDocumentChange({ before: before.doc, after: after.doc, actor, permissions: granted });
  const suggested = () => suggestAs(start(), insertFootnote({ newId: () => 'n0' }));

  it('admits a footnote suggested in a caption before another, numbered in reading order', () => {
    const before = caretAt(
      footnoteState([
        {
          type: 'figure',
          attrs: { src: 'https://example.com/a.png' },
          content: [{ type: 'caption', content: [text('Board')] }],
        },
        paragraph(text('Before after.'), note('n1', 'Old')),
      ]),
      'Board',
      5,
    );
    const after = suggestAs(before, insertFootnote({ newId: () => 'n0' }));
    expect(footnoteParts(after, 'number').filter((part) => part.startsWith('marker:'))).toEqual([
      'marker:1',
      'marker:2',
    ]);
    expect(allowed(before, after, 'writer')).toBe(true);
    expect(allowed(before, after, 'other')).toBe(false);
  });

  it('admits a writer’s own suggested footnote, its entry and the text suggested in it, and its withdrawal', () => {
    const before = start();
    const inserted = suggested();
    expect(allowed(before, inserted, 'writer')).toBe(true);
    const typed = suggestAs(inserted, typeText('New'));
    expect(allowed(inserted, typed, 'writer')).toBe(true);
    const withdrawn = runCommand(typed, rejectAllSuggestions);
    expect(footnoteParts(withdrawn)).toEqual(['marker:n1', 'entry:n1:Old']);
    expect(allowed(typed, withdrawn, 'writer')).toBe(true);
  });

  it('refuses a footnote inserted without the suggestion mark, or under another writer’s id', () => {
    const before = start();
    const plain = runCommand(before, insertFootnote({ newId: () => 'n0' }));
    expect(allowed(before, plain, 'writer')).toBe(false);
    const forged = suggestAs(before, insertFootnote({ newId: () => 'n0' }), 'owner');
    expect(allowed(before, forged, 'writer')).toBe(false);
  });

  it('refuses text written in a suggested footnote’s entry without suggesting it, by its writer or another', () => {
    const inserted = suggested();
    const written = inserted.apply(inserted.tr.insertText('Unmarked'));
    expect(allowed(inserted, written, 'writer')).toBe(false);
    const other = suggestAs(inserted, typeText('Mine'), 'mallory');
    expect(allowed(inserted, other, 'mallory')).toBe(true);
    expect(allowed(inserted, inserted.apply(inserted.tr.insertText('X')), 'mallory')).toBe(false);
  });

  it('refuses an entry with no suggested marker, a second entry for a footnote, and an entry taken without its marker', () => {
    const before = start();
    const area = footnoteAreaPos(before);
    const entryType = schema.nodes.footnote_entry;
    if (!entryType) throw new Error('No footnote entries.');
    const entry = (id: string) => entryType.create({ footnoteId: id });
    // Built as transactions and not applied, so the footnote plugin does not repair them.
    expect(allowed(before, before.tr.insert(area, entry('orphan')), 'writer')).toBe(false);
    expect(allowed(before, before.tr.insert(area, entry('n1')), 'writer')).toBe(false);
    const inserted = suggested();
    const twice = inserted.tr.insert(footnoteAreaPos(inserted), entry('n0'));
    expect(allowed(inserted, twice, 'writer')).toBe(false);
    const entryAt = listFootnotes(inserted.doc).get('n0')?.entry ?? 0;
    const node = inserted.doc.nodeAt(entryAt);
    const taken = inserted.tr.delete(entryAt, entryAt + (node?.nodeSize ?? 0));
    expect(allowed(inserted, taken, 'writer')).toBe(false);
  });

  it('refuses a footnote number the editors’ numbering does not give, also beside a suggested footnote', () => {
    const before = start();
    const markerAt = listFootnotes(before.doc).get('n1')?.marker ?? 0;
    const forged = before.tr.setNodeAttribute(markerAt, 'footnoteNumber', 7);
    expect(allowed(before, forged, 'writer')).toBe(false);
    const inserted = suggested();
    expect(allowed(before, inserted, 'writer')).toBe(true);
    const entryAt = listFootnotes(inserted.doc).get('n1')?.entry ?? 0;
    const renumbered = inserted.tr.setNodeAttribute(entryAt, 'footnoteNumber', 1);
    expect(allowed(before, { doc: renumbered.doc }, 'writer')).toBe(false);
    // The writer's own suggested footnote takes no other number either.
    const ownAt = listFootnotes(inserted.doc).get('n0')?.marker ?? 0;
    const own = inserted.tr.setNodeAttribute(ownAt, 'footnoteNumber', 5);
    expect(allowed(before, { doc: own.doc }, 'writer')).toBe(false);
  });

  it('lets only a writer who decides reject another writer’s suggested footnote', () => {
    const inserted = suggested();
    const rejected = runCommand(inserted, rejectAllSuggestions);
    expect(allowed(inserted, rejected, 'mallory')).toBe(false);
    expect(allowed(inserted, rejected, 'mallory', decider)).toBe(true);
    const accepted = runCommand(inserted, acceptAllSuggestions);
    expect(allowed(inserted, accepted, 'mallory')).toBe(false);
    expect(allowed(inserted, accepted, 'mallory', decider)).toBe(true);
  });
});

describe('DOCE-COLLAB-7.2 DOCE-EMBEDS-1.4 an inline embed in a guarded room', () => {
  const suggestOnly = { edit: false, suggest: true, comment: true, decide: false };
  const editor = { edit: true, suggest: true, comment: true, decide: false };
  const embed = (attrs: Record<string, unknown> = {}) => ({
    type: 'embed_inline',
    attrs: {
      id: 'e0000001',
      kind: 'cell',
      source: 'book!B2',
      snapshot: 'r1',
      text: '42',
      ...attrs,
    },
  });
  const stateOf = (content: DocumentFile['sections'][number]['content']) =>
    EditorState.create({
      doc: readDocumentFile({ formatVersion: 1, sections: [{ name: null, content }] }, schema).doc,
    });
  const holding = () =>
    stateOf([{ type: 'paragraph', attrs: { id: 'a0000001' }, content: [text('Total '), embed()] }]);
  const plain = () =>
    stateOf([{ type: 'paragraph', attrs: { id: 'a0000001' }, content: [text('Total ')] }]);
  const embedAt = (state: EditorState) => {
    let at = -1;
    state.doc.descendants((node, pos) => {
      if (node.type.name === 'embed_inline') at = pos;
      return at < 0;
    });
    return at;
  };
  const endOf = (state: EditorState) => {
    let at = -1;
    state.doc.descendants((node, pos) => {
      if (at < 0 && node.type.name === 'paragraph') at = pos + node.nodeSize - 1;
      return at < 0;
    });
    return at;
  };
  const created = () => {
    const type = schema.nodes.embed_inline;
    if (!type) throw new Error('No inline embeds.');
    return type.create(embed({ id: 'e0000002', source: 'book!C3' }).attrs);
  };
  const allowed = (
    before: EditorState,
    after: EditorState['doc'],
    actor: string,
    granted = suggestOnly,
  ) => checkDocumentChange({ before: before.doc, after, actor, permissions: granted });
  const suggested = (state: EditorState, tr: Transaction, author = 'writer') => {
    const rewritten = suggestTransaction(tr, state, { author, newId: () => 's0000001' });
    if (!rewritten) throw new Error('The change was not suggested.');
    return state.apply(rewritten).doc;
  };

  it('refuses a suggesting writer an inline embed inserted without its own suggestion mark', () => {
    const before = plain();
    const insert = () => before.tr.insert(endOf(before), created());
    expect(allowed(before, insert().doc, 'writer')).toBe(false);
    expect(allowed(before, suggested(before, insert(), 'owner'), 'writer')).toBe(false);
    expect(allowed(before, suggested(before, insert()), 'writer')).toBe(true);
  });

  it('refuses a suggesting writer a change to an inline embed’s source, pin, state or text', () => {
    const before = holding();
    const at = embedAt(before);
    for (const [name, value] of [
      ['source', 'book!Z9'],
      ['pinned', true],
      ['snapshot', 'r9'],
      ['text', '99'],
    ] as const) {
      expect(allowed(before, before.tr.setNodeAttribute(at, name, value).doc, 'writer')).toBe(
        false,
      );
    }
  });

  it('refuses a suggesting writer an inline embed removed outside a suggestion', () => {
    const before = holding();
    const at = embedAt(before);
    const remove = () => before.tr.delete(at, at + 1);
    expect(allowed(before, remove().doc, 'writer')).toBe(false);
    const proposed = suggested(before, remove());
    expect(allowed(before, proposed, 'writer')).toBe(true);
    expect(proposed.textBetween(0, proposed.content.size)).toContain('Total');
  });

  it('admits a writer who may edit inserting, changing and removing an inline embed', () => {
    const empty = plain();
    expect(allowed(empty, empty.tr.insert(endOf(empty), created()).doc, 'writer', editor)).toBe(
      true,
    );
    const before = holding();
    const at = embedAt(before);
    const repinned = before.tr.setNodeAttribute(at, 'pinned', true).doc;
    expect(allowed(before, repinned, 'writer', editor)).toBe(true);
    expect(allowed(before, before.tr.delete(at, at + 1).doc, 'writer', editor)).toBe(true);
  });
});

describe('DOCE-COLLAB-7.2 DOCE-OBJECTS-2.1 captions in a guarded room', () => {
  const suggestOnly = { edit: false, suggest: true, comment: true, decide: false };
  const editor = { edit: true, suggest: true, comment: true, decide: false };
  const captioned = (caption: string): DocumentFile['sections'][number]['content'][number] => ({
    type: 'table',
    attrs: { id: 't0000001' },
    content: [
      { type: 'caption', attrs: { id: 'c0000001' }, content: [text(caption)] },
      {
        type: 'tableRow',
        attrs: { id: 'r0000001' },
        content: [
          {
            type: 'tableCell',
            attrs: { id: 'd0000001' },
            content: [{ type: 'paragraph', attrs: { id: 'p0000001' }, content: [text('Cell')] }],
          },
        ],
      },
    ],
  });
  const stateOf = (caption: string) =>
    EditorState.create({
      doc: readDocumentFile(
        { formatVersion: 1, sections: [{ name: null, content: [captioned(caption)] }] },
        schema,
      ).doc,
    });
  // The caption's text: where it starts and ends.
  const captionText = (state: EditorState) => {
    let at = -1;
    state.doc.descendants((node, pos) => {
      if (node.type.name === 'table_caption') at = pos + 1;
      return at < 0;
    });
    return { from: at, to: at + 'Limits'.length };
  };
  const allowed = (before: EditorState, after: EditorState['doc'], granted = suggestOnly) =>
    checkDocumentChange({ before: before.doc, after, actor: 'writer', permissions: granted });

  it('lets a caption’s text change as any text does: edited by an editor, suggested by a suggester', () => {
    const before = stateOf('Limits');
    const { from, to } = captionText(before);
    const edited = before.tr.insertText('Power limits', from, to);
    expect(allowed(before, edited.doc)).toBe(false);
    expect(allowed(before, edited.doc, editor)).toBe(true);
    const suggestion = suggestTransaction(before.tr.insertText('Power ', from), before, {
      author: 'writer',
      newId: () => 's0000001',
    });
    if (!suggestion) throw new Error('The change was not suggested.');
    expect(allowed(before, before.apply(suggestion).doc)).toBe(true);
  });

  it('refuses even an editor a caption showing text only the pages draw, or a table marked as a part of one split', async () => {
    const room = await setup({ granted: editor });
    try {
      const figure = stateOf('Limits').doc.firstChild?.firstChild?.child(1)?.firstChild;
      if (figure?.type.name !== 'table_figure') throw new Error('No table with its caption.');
      // Inserts a table after the room's paragraph.
      const insert = (node: typeof figure) =>
        change(room.doc, (state) => {
          let end = -1;
          state.doc.descendants((each, pos) => {
            if (end < 0 && each.type.name === 'paragraph') end = pos + each.nodeSize;
            return end < 0;
          });
          return state.apply(state.tr.insert(end, node));
        });
      const caption = figure.firstChild;
      const table = figure.lastChild;
      if (!caption || !table) throw new Error('No caption.');
      const shown = caption.type.create({ ...caption.attrs, continuedText: 'Not its text' });
      for (const attack of [
        figure.type.create(figure.attrs, [shown, table]),
        figure.type.create({ splitPartIndex: 1 }, [caption, table]),
      ]) {
        insert(attack);
        await room.provider.whenStored();
        expect(room.provider.getState().refusal).toBe('unauthorized-write');
        expect(yjsToDocument(room.handle.snapshot(), { schema })).toEqual(file('Original'));
      }
    } finally {
      await room.close();
    }
  });

  it('refuses even an editor any block marked as what only the pages draw', async () => {
    const { nodes } = schema;
    const paragraphOf = (attrs: Record<string, unknown>) =>
      nodes.paragraph?.create({ dataId: 'p0000009', ...attrs }, schema.text('Part'));
    const listOf = (attrs: Record<string, unknown>) => {
      const paragraph = paragraphOf({});
      const item = paragraph && nodes.list_item?.create(attrs, paragraph);
      return item ? nodes.bullet_list?.create(null, item) : undefined;
    };
    const attacks: [string, ProseMirrorNode | undefined][] = [
      ['a paragraph marked as a part', paragraphOf({ splitPartIndex: 1 })],
      ['a placeholder paragraph', paragraphOf({ continuationPlaceholder: true })],
      ['a list item continued from a page', listOf({ orphanedListContinuation: true })],
      ['a list item marked as a part', listOf({ splitPartIndex: 0 })],
    ];
    for (const [name, attack] of attacks) {
      if (!attack) throw new Error(name);
      const room = await setup({ granted: editor });
      try {
        change(room.doc, (state) => {
          let end = -1;
          state.doc.descendants((each, pos) => {
            if (end < 0 && each.type.name === 'paragraph') end = pos + each.nodeSize;
            return end < 0;
          });
          return state.apply(state.tr.insert(end, attack));
        });
        await room.provider.whenStored();
        expect(room.provider.getState().refusal, name).toBe('unauthorized-write');
        expect(yjsToDocument(room.handle.snapshot(), { schema }), name).toEqual(file('Original'));
      } finally {
        await room.close();
      }
    }
  });

  it('counts a change of the part a block is as an edit, refused to a writer who may only decide', () => {
    const before = stateOf('Limits');
    let at = -1;
    before.doc.descendants((node, pos) => {
      if (at < 0 && node.type.name === 'paragraph') at = pos;
      return at < 0;
    });
    const parted = before.apply(before.tr.setNodeAttribute(at, 'splitPartIndex', 1));
    const decider = { edit: false, suggest: false, comment: true, decide: true };
    expect(allowed(before, parted.doc, decider)).toBe(false);
    expect(allowed(before, parted.doc)).toBe(false);
  });

  // The room's document with a node added after its paragraph, built without the schema's checks,
  // as a writer sending raw content could.
  const withRaw = (doc: Y.Doc, added: ProseMirrorNode) => {
    const held = readContent(schema, doc.get('content'));
    if (!held) throw new Error('Missing seeded content.');
    let at = -1;
    held.descendants((each, pos) => {
      if (at < 0 && each.type.name === 'paragraph') at = pos;
      return at < 0;
    });
    const $at = held.resolve(at);
    let next = $at.parent.copy($at.parent.content.addToEnd(added));
    for (let depth = $at.depth - 1; depth >= 0; depth -= 1) {
      const node = $at.node(depth);
      next = node.copy(node.content.replaceChild($at.index(depth), next));
    }
    doc.get('content').applyDelta(diffNodes(held, next) as never);
  };

  it('refuses even an editor a table, table holder or figure that is not whole', async () => {
    const figure = stateOf('Limits').doc.firstChild?.firstChild?.child(1)?.firstChild;
    const caption = figure?.firstChild;
    const table = figure?.lastChild;
    const image = createFigure(schema, { src: 'https://example.com/a.png' }, 'Board');
    const block = schema.nodes.paragraph?.create(null, schema.text('Block'));
    if (figure?.type.name !== 'table_figure' || !caption || !table || !image || !block) {
      throw new Error('No table with its caption.');
    }
    const shapes: [string, ProseMirrorNode][] = [
      ['a table with no holder', table],
      ['a holder without its caption', figure.type.create(null, [table])],
      ['a holder with two captions', figure.type.create(null, [caption, caption, table])],
      ['a figure without its caption', image.type.create(image.attrs, [])],
      [
        'a block inside a caption',
        figure.type.create(null, [caption.type.create(caption.attrs, [block]), table]),
      ],
    ];
    for (const [name, shape] of shapes) {
      const room = await setup({ granted: editor });
      try {
        withRaw(room.doc, shape);
        await room.provider.whenStored();
        expect(room.provider.getState().refusal, name).toBe('unauthorized-write');
        expect(yjsToDocument(room.handle.snapshot(), { schema }), name).toEqual(file('Original'));
      } finally {
        await room.close();
      }
    }
  });

  // A table cannot be a suggested block (DOCE-SUGGESTIONS-1.5): the suggestion engine refuses to
  // insert or delete one whole, and the room refuses a whole table marked as a suggester's.
  it('refuses a suggester a whole table with its caption, even marked as the suggester’s', async () => {
    const room = await setup();
    try {
      const figure = stateOf('Limits').doc.firstChild?.firstChild?.child(1)?.firstChild;
      if (figure?.type.name !== 'table_figure') throw new Error('No table with its caption.');
      change(room.doc, (state) => {
        let end = -1;
        state.doc.descendants((each, pos) => {
          if (end < 0 && each.type.name === 'paragraph') end = pos + each.nodeSize;
          return end < 0;
        });
        // The suggestion engine makes no such change; a writer sending raw content could.
        const insertion = schema.marks.insertion;
        if (!insertion) throw new Error('Missing insertion.');
        const tr = state.tr.insert(end, figure);
        const suggested = tr.addMark(
          end,
          end + figure.nodeSize,
          insertion.create({ dataId: 's0000002', dataAuthor: 'writer' }),
        );
        let marked = 0;
        suggested.doc.descendants((each) => {
          if (each.isText && each.marks.some((mark) => mark.type === insertion)) marked += 1;
        });
        expect(marked).toBe(2);
        return state.apply(suggested);
      });
      await room.provider.whenStored();
      expect(room.provider.getState().refusal).toBe('unauthorized-write');
      expect(yjsToDocument(room.handle.snapshot(), { schema })).toEqual(file('Original'));
    } finally {
      await room.close();
    }
  });

  // A whole figure is a suggested block (DOCE-SUGGESTIONS-1.4): the figure carries the suggestion,
  // and its caption's text the same suggestion's marks, which name its writer.
  describe('a suggested whole figure', () => {
    const decider = { edit: false, suggest: false, comment: true, decide: true };
    const figured = (caption: string, more: boolean) =>
      EditorState.create({
        doc: readDocumentFile(
          {
            formatVersion: 1,
            sections: [
              {
                name: null,
                content: [
                  { type: 'paragraph', attrs: { id: 'p0000001' }, content: [text('Original')] },
                  ...(more
                    ? [
                        {
                          type: 'figure',
                          attrs: { id: 'f0000001', src: 'https://example.com/a.png' },
                          content: [
                            {
                              type: 'caption',
                              attrs: { id: 'c0000002' },
                              content: caption ? [text(caption)] : [],
                            },
                          ],
                        },
                      ]
                    : []),
                ],
              },
            ],
          },
          schema,
        ).doc,
      });
    const figureAt = (state: EditorState) => {
      let at = -1;
      state.doc.descendants((node, pos) => {
        if (at < 0 && node.type.name === 'figure') at = pos;
        return at < 0;
      });
      return at;
    };
    let ids = 0;
    const suggested = (state: EditorState, tr: Transaction, author = 'writer') => {
      const out = suggestTransaction(tr, state, {
        author,
        newId: () => `s${(ids += 1).toString(16).padStart(7, '0')}`,
      });
      return out ? state.apply(out) : null;
    };
    const deleting = (state: EditorState, author = 'writer') => {
      const at = figureAt(state);
      const node = state.doc.nodeAt(at);
      return node ? suggested(state, state.tr.delete(at, at + node.nodeSize), author) : null;
    };
    const inserting = (author = 'writer') => {
      const empty = figured('', false);
      const source = figured('Board', true);
      const figure = source.doc.nodeAt(figureAt(source));
      let at = -1;
      empty.doc.descendants((node, pos) => {
        if (at < 0 && node.type.name === 'paragraph') at = pos + node.nodeSize;
        return at < 0;
      });
      return figure
        ? { empty, state: suggested(empty, empty.tr.insert(at, figure), author) }
        : null;
    };
    const decided = (state: EditorState, command: Command) => {
      let next = state;
      command(state, (tr) => (next = state.apply(tr)));
      return next;
    };
    const check = (
      before: EditorState,
      after: EditorState,
      granted: typeof suggestOnly,
      actor = 'writer',
    ) => checkDocumentChange({ before: before.doc, after: after.doc, actor, permissions: granted });

    it('lets a suggester suggest deleting a whole figure, and a decider accept or reject it', () => {
      const before = figured('Board', true);
      const deleted = deleting(before);
      if (!deleted) throw new Error('The deletion was not suggested.');
      expect(deleted.doc.nodeAt(figureAt(deleted))?.attrs.suggestionSplitKind).toBe('deletion');
      expect(check(before, deleted, suggestOnly)).toBe(true);
      expect(check(before, deleted, suggestOnly, 'other')).toBe(false);
      const accepted = decided(deleted, acceptAllSuggestions);
      expect(figureAt(accepted)).toBe(-1);
      expect(check(deleted, accepted, decider, 'decider')).toBe(true);
      expect(check(deleted, accepted, suggestOnly, 'other')).toBe(false);
      const rejected = decided(deleted, rejectAllSuggestions);
      expect(rejected.doc.eq(before.doc)).toBe(true);
      expect(check(deleted, rejected, decider, 'decider')).toBe(true);
      // Its writer may withdraw it.
      expect(check(deleted, rejected, suggestOnly)).toBe(true);
    });

    it('lets a suggester suggest inserting a whole figure, as theirs only', () => {
      const inserted = inserting();
      if (!inserted?.state) throw new Error('The insertion was not suggested.');
      const { empty, state } = inserted;
      expect(state.doc.nodeAt(figureAt(state))?.attrs).toMatchObject({
        suggestionSplitKind: 'insertion',
        dataAuthor: 'writer',
      });
      expect(check(empty, state, suggestOnly)).toBe(true);
      expect(check(empty, state, suggestOnly, 'other')).toBe(false);
      expect(check(state, decided(state, acceptAllSuggestions), decider, 'decider')).toBe(true);
      expect(check(state, decided(state, rejectAllSuggestions), decider, 'decider')).toBe(true);
      // Another suggester may suggest deleting it, as another writer's suggested text.
      const deleted = deleting(state, 'other');
      expect(deleted && check(state, deleted, suggestOnly, 'other')).toBe(true);
    });

    it('refuses a figure marked for deletion without its writer’s marks, or with another’s', () => {
      const before = figured('Board', true);
      const at = figureAt(before);
      const figure = before.doc.nodeAt(at);
      const deletion = schema.marks.deletion;
      if (!figure || !deletion) throw new Error('No figure.');
      const marked = before.apply(
        before.tr.setNodeMarkup(at, null, {
          ...figure.attrs,
          suggestionSplitKind: 'deletion',
          suggestionSplitId: 's0000099',
        }),
      );
      expect(check(before, marked, suggestOnly)).toBe(false);
      const caption = { from: at + 2, to: at + 2 + 'Board'.length };
      const by = (author: string) =>
        marked.apply(
          marked.tr.addMark(
            caption.from,
            caption.to,
            deletion.create({ dataId: 's0000099', dataAuthor: author }),
          ),
        );
      expect(check(before, by('other'), suggestOnly)).toBe(false);
      expect(check(before, by('writer'), suggestOnly)).toBe(true);
      // A figure with no caption text has nothing to name its writer: deleting it is not suggested.
      expect(deleting(figured('', true))).toBeNull();
    });
  });

  // Two editors' changes, each allowed alone, that together would leave a list with no items: the
  // room reads each change exactly as it comes, so it refuses the later one rather than take a
  // shape no reader can read, and the refused writer is refused as after any refused write.
  it('refuses the later of two editors’ changes that together leave a shape the schema refuses', async () => {
    const room = await setup({ granted: editor });
    try {
      const { nodes } = schema;
      const item = (value: string) =>
        nodes.list_item?.create(null, nodes.paragraph?.create(null, schema.text(value)));
      const first = item('One');
      const second = item('Two');
      const list = first && second ? nodes.bullet_list?.create(null, [first, second]) : null;
      if (!list) throw new Error('No list.');
      change(room.doc, (state) => {
        let end = -1;
        state.doc.descendants((each, pos) => {
          if (end < 0 && each.type.name === 'paragraph') end = pos + each.nodeSize;
          return end < 0;
        });
        return state.apply(state.tr.insert(end, list));
      });
      await room.provider.whenStored();
      await vi.waitFor(() =>
        expect(readContent(schema, room.observerDoc.get('content'))?.textContent).toContain('Two'),
      );
      expect(room.provider.getState().refusal).toBeNull();
      // Each writer deletes a different item, from the same state, before seeing the other's.
      const deleting = (index: number) => {
        const copy = new Y.Doc();
        Y.applyUpdate(copy, Y.encodeStateAsUpdate(room.doc));
        const before = Y.encodeStateVector(copy);
        change(copy, (state) => {
          let at = -1;
          state.doc.descendants((each, pos) => {
            if (at < 0 && each.type.name === 'bullet_list') at = pos;
            return at < 0;
          });
          const found = state.doc.nodeAt(at);
          if (!found) throw new Error('No list.');
          let from = at + 1;
          for (let child = 0; child < index; child += 1) from += found.child(child).nodeSize;
          return state.apply(state.tr.delete(from, from + found.child(index).nodeSize));
        });
        const update = Y.encodeStateAsUpdate(copy, before);
        copy.destroy();
        return update;
      };
      const firstDeleted = deleting(0);
      const secondDeleted = deleting(1);
      Y.applyUpdate(room.doc, firstDeleted);
      await room.provider.whenStored();
      expect(room.provider.getState().refusal).toBeNull();
      const stored = () => yjsToDocument(room.handle.snapshot(), { schema });
      const admitted = stored();
      expect(JSON.stringify(admitted)).not.toContain('One');
      expect(JSON.stringify(admitted)).toContain('Two');
      // The other writer's change comes after it: the room refuses it and stays whole.
      Y.applyUpdate(room.observerDoc, secondDeleted);
      await vi.waitFor(() => expect(room.observer.getState().refusal).toBe('unauthorized-write'));
      expect(stored()).toEqual(admitted);
      // The refused writer is refused as after any refused write: cut off, its change unsent, until
      // it joins again, which brings the room's content.
      expect(room.observer.getState()).toMatchObject({
        status: 'disconnected',
        hasUnconfirmedChanges: true,
      });
      const rejoined = new Y.Doc();
      Y.applyUpdate(rejoined, room.handle.snapshot());
      expect(yjsToDocument(Y.encodeStateAsUpdate(rejoined), { schema })).toEqual(admitted);
      rejoined.destroy();
    } finally {
      await room.close();
    }
  });

  it('accepts a whole table with its caption from an editor', async () => {
    const room = await setup({ granted: editor });
    try {
      const figure = stateOf('Limits').doc.firstChild?.firstChild?.child(1)?.firstChild;
      if (figure?.type.name !== 'table_figure') throw new Error('No table with its caption.');
      change(room.doc, (state) => {
        let end = -1;
        state.doc.descendants((each, pos) => {
          if (end < 0 && each.type.name === 'paragraph') end = pos + each.nodeSize;
          return end < 0;
        });
        return state.apply(state.tr.insert(end, figure));
      });
      await room.provider.whenStored();
      expect(room.provider.getState().refusal).toBeNull();
      const stored = yjsToDocument(room.handle.snapshot(), { schema });
      expect(stored?.sections[0]?.content[1]?.content?.[0]).toMatchObject({
        type: 'caption',
        content: [{ type: 'text', text: 'Limits' }],
      });
    } finally {
      await room.close();
    }
  });
});
