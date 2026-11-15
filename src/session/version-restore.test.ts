import { EditorView } from 'prosemirror-view';
import { describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { createSessionRooms } from '../../test/session-rooms.js';
import { updateRoomDocument, yjsToDocument } from '../collab/convert.js';
import type { EditorHost, VersionStoreAdapter } from '../host/adapters.js';
import { createMemoryHost } from '../host/memory-host.js';
import type { DocumentFile } from '../model/format/document-format.js';
import { createDocumentSession, type DocumentSession } from './document-session.js';
import { createDocumentVersions } from './versions.js';

const body = (text: string): DocumentFile => ({
  formatVersion: 1,
  sections: [
    {
      name: null,
      content: [
        { type: 'paragraph', attrs: { id: 'a0000001' }, content: [{ type: 'text', text }] },
      ],
    },
  ],
});

function mount(session: DocumentSession): EditorView {
  const shown = session.document.get();
  if (!shown) throw new Error('No room document.');
  const view: EditorView = new EditorView(document.createElement('div'), {
    state: shown.state,
    dispatchTransaction: (transaction) => {
      view.updateState(view.state.apply(transaction));
      session.update(view.state);
    },
  });
  return view;
}

async function openRoom(
  versionStore: (
    versions: VersionStoreAdapter,
    rooms: ReturnType<typeof createSessionRooms>,
  ) => VersionStoreAdapter,
) {
  const memory = createMemoryHost({ documents: [{ id: 'doc', content: body('Historical') }] });
  if (!memory.versions) throw new Error('No version store.');
  const rooms = createSessionRooms({ documents: [{ id: 'doc', content: body('Current') }] });
  // The room route must work without a store-mode document subscription.
  const host: EditorHost = {
    ...memory,
    documents: { load: memory.documents.load, save: memory.documents.save },
    collaboration: rooms.adapter('reader'),
    versions: versionStore(memory.versions, rooms),
  };
  const session = createDocumentSession({ host, documentId: 'doc', mode: 'room' });
  await session.ready;
  const view = mount(session);
  const stop = session.document.subscribe((shown) => {
    if (shown && view.state !== shown.state) view.updateState(shown.state);
  });
  const versions = createDocumentVersions({ host, session });
  await versions.refresh();
  return {
    host,
    session,
    view,
    versions,
    rooms,
    close: async () => {
      versions.close();
      stop();
      view.destroy();
      session.close();
      await rooms.close();
    },
  };
}

const textOf = (session: DocumentSession) => {
  const doc = session.document.get()?.state.doc;
  return doc?.textBetween(0, doc.content.size);
};

describe('authoritative room version restore', () => {
  it('DOCE-VERSIONS-4.5 flushes before the host service and takes restored content from the room', async () => {
    const restore = vi.fn();
    const opened = await openRoom((versions, rooms) => ({
      ...versions,
      restore: async (documentId, revision) => {
        restore(documentId, revision);
        const historical = await versions.load(documentId, revision);
        if (!historical.ok) return historical;
        const handle = await rooms.server.openRoom(documentId);
        try {
          const before = yjsToDocument(handle.snapshot(), { schema: documentSchema });
          expect(JSON.stringify(before)).toContain('Current!');
          expect(
            handle.transact({ actor: { id: 'restore-service' }, capabilities: [] }, (doc) => {
              updateRoomDocument(doc, historical.value, { schema: documentSchema });
            }),
          ).toBe(true);
          await handle.flush();
          return { ok: true, value: { revision: 'restored', sequence: 2 } };
        } finally {
          handle.release();
        }
      },
    }));
    try {
      let at = 0;
      opened.view.state.doc.descendants((node, pos) => {
        if (node.isText) at = pos + (node.text?.length ?? 0);
      });
      opened.view.dispatch(opened.view.state.tr.insertText('!', at));
      const flush = vi.spyOn(opened.session, 'flush');
      await expect(opened.versions.restore('rev-1')).resolves.toMatchObject({ ok: true });
      expect(flush).toHaveBeenCalledOnce();
      expect(restore).toHaveBeenCalledExactlyOnceWith('doc', 'rev-1');
      await vi.waitFor(() => expect(textOf(opened.session)).toBe('Historical'));
    } finally {
      await opened.close();
    }
  });

  it('DOCE-VERSIONS-4.5 returns an authoritative service failure without a fallback room write', async () => {
    const restore = vi.fn(() =>
      Promise.resolve({ ok: false as const, error: { kind: 'denied' as const } }),
    );
    const opened = await openRoom((versions) => ({ ...versions, restore }));
    try {
      const update = vi.spyOn(opened.session, 'update');
      await expect(opened.versions.restore('rev-1')).resolves.toMatchObject({
        error: { kind: 'denied' },
      });
      expect(restore).toHaveBeenCalledOnce();
      expect(update).not.toHaveBeenCalled();
      expect(textOf(opened.session)).toBe('Current');
    } finally {
      await opened.close();
    }
  });

  it('DOCE-VERSIONS-4.5 retains the editable fallback when the room host has no restore route', async () => {
    const opened = await openRoom(({ restore: _, ...versions }) => versions);
    try {
      await expect(opened.versions.restore('rev-1')).resolves.toMatchObject({ ok: true });
      expect(textOf(opened.session)).toBe('Historical');
      const handle = await opened.rooms.server.openRoom('doc');
      try {
        expect(
          JSON.stringify(yjsToDocument(handle.snapshot(), { schema: documentSchema })),
        ).toContain('Historical');
      } finally {
        handle.release();
      }
    } finally {
      await opened.close();
    }
  });
  it('DOCE-VERSIONS-4.5 refuses the service restore when pending room changes cannot flush', async () => {
    const restore = vi.fn(() =>
      Promise.resolve({ ok: true as const, value: { revision: 'restored', sequence: 2 } }),
    );
    const opened = await openRoom((versions) => ({ ...versions, restore }));
    try {
      vi.spyOn(opened.session, 'flush').mockResolvedValue(false);
      const update = vi.spyOn(opened.session, 'update');
      await expect(opened.versions.restore('rev-1')).resolves.toMatchObject({
        error: { kind: 'unavailable' },
      });
      expect(restore).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
      expect(textOf(opened.session)).toBe('Current');
    } finally {
      await opened.close();
    }
  });
});
