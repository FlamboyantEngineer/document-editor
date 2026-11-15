import { readFileSync } from 'node:fs';
import * as Y from '@y/y';
import { describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { readRoomThreads } from '../collab/comment-records.js';
import { createRoomCommentStore } from '../collab/comment-store.js';
import { historicalEditorProps } from '../components/document-panels/document-history.js';
import type { DocumentVersion, DocumentVersionSnapshot } from '../host/adapters.js';
import { createMemoryHistory, createMemoryVersions } from '../host/memory-documents.js';
import { createMemoryHost } from '../host/memory-host.js';
import type { DocumentFile } from '../model/format/document-format.js';
import type { TemplateFile } from '../model/format/template-format.js';
import { readDocumentFile, writeDocumentFile } from '../model/index.js';
import { createDocumentSession } from './document-session.js';
import { createDocumentVersions } from './versions.js';

const content: DocumentFile = {
  formatVersion: 1,
  sections: [
    { name: null, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'First' }] }] },
  ],
};

async function open() {
  const host = createMemoryHost({ documents: [{ id: 'doc', content }] });
  const session = createDocumentSession({ host, documentId: 'doc', mode: 'store' });
  await session.ready;
  return { host, session };
}

describe('revision discussion snapshots', () => {
  it('DOCE-VERSIONS-5.5 captures changed discussion as a distinct immutable revision with content', async () => {
    const { host, session } = await open();
    const comments = host.comments;
    if (!comments) throw new Error('No comments.');
    const versions = createDocumentVersions({ host, session });
    await comments.create('doc', { id: 'thread', quote: 'First', text: 'Original' });
    const saved = await versions.saveVersion('Reviewed');
    if (!saved.ok) throw new Error('No version.');
    await comments.reply('doc', 'thread', 'Later');
    const next = await versions.saveVersion('Later discussion');
    if (!next.ok) throw new Error('No next version.');
    expect(next.value.revision).not.toBe(saved.value.revision);
    const opened = await versions.viewVersion(saved.value.revision, { returnTo: null });
    if (!opened.ok) throw new Error('No historical view.');
    const historical = opened.value.version;
    expect(historical.threads?.[0]?.entries.map(({ text }) => text)).toEqual(['Original']);
    const props = historicalEditorProps(versions, { view: opened.value });
    expect(props.comments).toMatchObject({ store: historical.comments, canComment: false });
    const listed = await historical.comments.list('doc');
    if (!listed.ok) throw new Error('No historical discussion.');
    listed.value[0]?.entries.splice(0);
    expect(await historical.comments.list('doc')).toMatchObject({
      value: [{ entries: [{ text: 'Original' }] }],
    });
    await expect(historical.comments.reply('doc', 'thread', 'Forbidden')).resolves.toMatchObject({
      error: { kind: 'denied' },
    });
    versions.updateView((state) => state.apply(state.tr.insertText('Forbidden', 2)));
    expect(versions.view.get()?.version.state.doc.textContent).toBe('First');
    await versions.restore(saved.value.revision);
    expect(await comments.list('doc')).toMatchObject({
      value: [{ entries: [{ text: 'Original' }, { text: 'Later' }] }],
    });
    versions.close();
    session.close();
  });

  it('DOCE-VERSIONS-5.5 reads room discussion through the host atomic snapshot source', async () => {
    const { host, session } = await open();
    const doc = new Y.Doc();
    const comments = createRoomCommentStore({ doc, identity: host.identity });
    const history = createMemoryHistory(
      () => 'reader',
      () => new Date(),
      () => readRoomThreads(doc.get('comments')),
    );
    history.record('doc', content);
    const versions = createDocumentVersions({
      host: { ...host, comments, versions: createMemoryVersions(history) },
      session,
    });
    await comments.create('doc', { id: 'room-thread', quote: 'First', text: 'Room original' });
    const saved = await versions.saveVersion('Room snapshot');
    if (!saved.ok) throw new Error('No snapshot.');
    await comments.reply('doc', 'room-thread', 'Room later');
    const view = await versions.viewVersion(saved.value.revision, { returnTo: null });
    if (!view.ok) throw new Error('No view.');
    expect(view.value.version.threads?.[0]?.entries.map(({ text }) => text)).toEqual([
      'Room original',
    ]);
    await expect(view.value.version.comments.remove('doc', 'room-thread')).resolves.toMatchObject({
      error: { kind: 'denied' },
    });
    expect(await comments.list('doc')).toMatchObject({
      value: [{ entries: [{ text: 'Room original' }, { text: 'Room later' }] }],
    });
    versions.close();
    session.close();
    doc.destroy();
  });

  it('DOCE-VERSIONS-5.5 never substitutes live discussion for content-only hosts', async () => {
    const { host, session } = await open();
    if (!host.versions) throw new Error('No versions.');
    const { loadSnapshot: _, ...store } = host.versions;
    const versions = createDocumentVersions({ host: { ...host, versions: store }, session });
    await versions.refresh();
    const view = await versions.viewVersion('rev-1', { returnTo: null });
    if (!view.ok) throw new Error('No view.');
    expect(view.value.version.threads).toBeNull();
    await expect(view.value.version.comments.list('doc')).resolves.toEqual({ ok: true, value: [] });
    versions.close();
    session.close();
  });
  it('DOCE-VERSIONS-5.5 fails an unavailable snapshot without reading current discussion', async () => {
    const { host, session } = await open();
    const versions = createDocumentVersions({ host, session });
    await versions.refresh();
    host.memory.failNext('versions.load', { kind: 'unavailable', message: 'Snapshot unavailable' });
    await expect(versions.viewVersion('rev-1', { returnTo: null })).resolves.toMatchObject({
      error: { kind: 'unavailable' },
    });
    expect(versions.view.get()).toBeNull();
    versions.close();
    session.close();
  });
  it('DOCE-VERSIONS-5.5 propagates an arbitrary host transaction conflict without publishing a bundle', async () => {
    const { host, session } = await open();
    if (!host.versions) throw new Error('No versions.');
    let authoritativeContent = content;
    const store = {
      ...host.versions,
      create: (_id: string, request: { content: DocumentFile; label: string | null }) => {
        // A real host makes this comparison and discussion capture in one storage transaction.
        if (JSON.stringify(request.content) !== JSON.stringify(authoritativeContent))
          return Promise.resolve({ ok: false as const, error: { kind: 'conflict' as const } });
        throw new Error('The stale snapshot must be refused.');
      },
    };
    const versions = createDocumentVersions({
      host: { ...host, versions: store },
      session,
      beforeVersion: (request) => {
        authoritativeContent = { formatVersion: 1, sections: [] };
        return request;
      },
    });
    await versions.refresh();
    await expect(versions.saveVersion('Stale capture')).resolves.toMatchObject({
      error: { kind: 'conflict' },
    });
    expect(versions.list.get().versions).toHaveLength(1);
    expect(versions.view.get()).toBeNull();
    versions.close();
    session.close();
  });
  it('DOCE-VERSIONS-5.5 keeps historical embed output without consulting its live source', async () => {
    const stored: DocumentFile = {
      formatVersion: 1,
      sections: [
        {
          name: null,
          content: [
            {
              type: 'embed',
              attrs: {
                kind: 'spreadsheet',
                source: '["book","sheet","A1"]',
                snapshot: 'source-revision-1',
                label: 'Captured',
              },
              content: [{ type: 'paragraph', content: [{ type: 'text', text: '42' }] }],
            },
          ],
        },
      ],
    };
    const memory = createMemoryHost({ documents: [{ id: 'doc', content: stored }] });
    const load = vi.fn(() =>
      Promise.resolve({ ok: false as const, error: { kind: 'unavailable' as const } }),
    );
    const resolve = vi.fn(() => Promise.resolve({ ok: true as const, value: [] }));
    const host = { ...memory, embeds: { kinds: ['spreadsheet'], load, resolve } };
    const session = createDocumentSession({ host, documentId: 'doc', mode: 'store' });
    await session.ready;
    const versions = createDocumentVersions({ host, session });
    await versions.refresh();
    const viewed = await versions.viewVersion('rev-1', { returnTo: null });
    if (!viewed.ok) throw new Error('No historical view.');
    expect(
      viewed.value.version.state.doc.textBetween(0, viewed.value.version.state.doc.content.size),
    ).toBe('42');
    expect(load).not.toHaveBeenCalled();
    expect(resolve).not.toHaveBeenCalled();
    versions.close();
    session.close();
  });
  it('DOCE-VERSIONS-5.5 DOCE-FORMAT-1.1 DOCE-FORMAT-1.2 DOCE-FORMAT-9.9 freezes a pinned revision bundle with discussion and linked output', async () => {
    const fixture = JSON.parse(
      readFileSync('test/fixtures/documents/contracts/version-bundle-linked.json', 'utf8'),
    ) as {
      version: DocumentVersion;
      template: TemplateFile;
      snapshot: DocumentVersionSnapshot;
    };
    const host = createMemoryHost({
      documents: [{ id: 'doc', content: fixture.snapshot.content }],
      templates: [fixture.template],
    });
    const session = createDocumentSession({ host, documentId: 'doc', mode: 'store' });
    await session.ready;
    const versions = createDocumentVersions({
      host: {
        ...host,
        versions: {
          list: () => Promise.resolve({ ok: true, value: [structuredClone(fixture.version)] }),
          load: () =>
            Promise.resolve({ ok: true, value: structuredClone(fixture.snapshot.content) }),
          loadSnapshot: () =>
            Promise.resolve({ ok: true, value: structuredClone(fixture.snapshot) }),
        },
      },
      session,
    });
    await versions.refresh();
    const viewed = await versions.viewVersion(fixture.version.revision, { returnTo: null });
    if (!viewed.ok) throw new Error('No frozen revision.');
    expect(viewed.value.version.pin).toEqual({ id: 'report', revision: 'rev-1' });
    expect(viewed.value.version.template.id).toBe('report');
    expect(viewed.value.version.threads).toEqual(fixture.snapshot.threads);
    const parsed = readDocumentFile(fixture.snapshot.content, documentSchema).doc;
    expect(writeDocumentFile(parsed, { template: fixture.snapshot.content.template })).toEqual(
      fixture.snapshot.content,
    );
    expect(
      viewed.value.version.state.doc.textBetween(0, viewed.value.version.state.doc.content.size),
    ).toBe('Captured total42NoteCaptured');
    versions.close();
    session.close();
  });
  it('DOCE-VERSIONS-5.5 refuses a stale pre-hook body after another writer saves', async () => {
    const { host, session } = await open();
    let enter: (() => void) | undefined;
    let resume: (() => void) | undefined;
    const entered = new Promise<void>((resolve) => {
      enter = resolve;
    });
    const paused = new Promise<void>((resolve) => {
      resume = resolve;
    });
    const versions = createDocumentVersions({
      host,
      session,
      beforeVersion: async (request) => {
        enter?.();
        await paused;
        return request;
      },
    });
    const saving = versions.saveVersion('Paused version');
    await entered;
    const bodyB: DocumentFile = {
      formatVersion: 1,
      sections: [
        {
          name: null,
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Concurrent body' }] }],
        },
      ],
    };
    await host.documents.save('doc', { content: bodyB, baseRevision: 'rev-1' });
    const beforeHistory = await host.versions?.list('doc');
    const beforeSnapshot = await host.versions?.loadSnapshot?.('doc', 'rev-2');
    resume?.();
    try {
      await expect(saving).resolves.toMatchObject({ ok: false, error: { kind: 'conflict' } });
      await expect(host.documents.load('doc')).resolves.toMatchObject({
        value: { revision: 'rev-2', content: bodyB },
      });
      expect(await host.versions?.list('doc')).toEqual(beforeHistory);
      expect(await host.versions?.loadSnapshot?.('doc', 'rev-2')).toEqual(beforeSnapshot);
      expect(await host.versions?.list('doc')).toMatchObject({
        value: [{ revision: 'rev-2' }, { revision: 'rev-1' }],
      });
    } finally {
      versions.close();
      session.close();
    }
  });
  it('DOCE-VERSIONS-5.5 allows a hook body transform while its detached baseline is still current', async () => {
    const { host, session } = await open();
    const versions = createDocumentVersions({
      host,
      session,
      beforeVersion: async (request) => {
        expect(request).not.toHaveProperty('baseContent');
        await Promise.resolve();
        request.content.sections.splice(0, 1, {
          name: null,
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Transformed' }] }],
        });
        return request;
      },
    });
    try {
      await expect(versions.saveVersion('Transformed version')).resolves.toMatchObject({
        ok: true,
        value: { revision: 'rev-2' },
      });
      const latest = await host.documents.load('doc');
      if (!latest.ok) throw new Error('No transformed document.');
      const doc = readDocumentFile(latest.value.content, documentSchema).doc;
      expect(doc.textBetween(0, doc.content.size)).toBe('Transformed');
    } finally {
      versions.close();
      session.close();
    }
  });
});
