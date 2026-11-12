import type { EditorState } from 'prosemirror-state';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EditorHost, SavedState } from '../host/adapters.js';
import { FULL_CAPABILITIES, READ_ONLY_CAPABILITIES } from '../host/capabilities.js';
import { createMemoryHost } from '../host/memory-host.js';
import type { LifecycleEvent } from '../host/session-adapters.js';
import type { DocumentFile } from '../model/format/document-format.js';
import { createDocumentSession, type DocumentSession } from './document-session.js';

const DOCUMENT: DocumentFile = {
  formatVersion: 1,
  sections: [
    {
      name: null,
      content: [
        {
          type: 'paragraph',
          attrs: { id: 'a0000001' },
          content: [{ type: 'text', text: 'Hello' }],
        },
      ],
    },
  ],
};

const hostWith = (content: DocumentFile = DOCUMENT) =>
  createMemoryHost({ documents: [{ id: 'doc', content }] });

const open = (host: EditorHost, autosaveDelay = 1000) =>
  createDocumentSession({ host, documentId: 'doc', mode: 'store', autosaveDelay });

const shown = (session: DocumentSession) => {
  const document = session.document.get();
  if (!document) throw new Error('The session has no document.');
  return document;
};

// The position after the first character of the document's text.
const afterFirst = (state: EditorState) => {
  let at = -1;
  state.doc.descendants((node, pos) => {
    if (at < 0 && node.isText) at = pos + 1;
    return at < 0;
  });
  return at;
};

const typeText = (session: DocumentSession, text: string) =>
  session.update((state: EditorState) => state.apply(state.tr.insertText(text, afterFirst(state))));

const storedText = async (host: EditorHost) => {
  const loaded = await host.documents.load('doc');
  return loaded.ok ? JSON.stringify(loaded.value.content) : '';
};

afterEach(() => {
  vi.useRealTimers();
});

describe('createDocumentSession in store mode', () => {
  it('DOCE-SESSION-1.1 opens a document by id with its template and capabilities', async () => {
    const session = open(hostWith());
    expect(session.status.get().load).toBe('loading');
    expect(await session.ready).toBe(true);
    const document = shown(session);
    const { doc } = document.state;
    expect(doc.textBetween(0, doc.content.size)).toBe('Hello');
    expect(document.template.id).toBeTruthy();
    expect(document.capabilities).toEqual(FULL_CAPABILITIES);
    expect(document.editingMode).toBe('edit');
    expect(session.status.get()).toEqual({
      load: 'ready',
      save: 'idle',
      error: null,
      dirty: false,
    });
  });

  it('DOCE-SESSION-1.2 reports a document it cannot load', async () => {
    const session = createDocumentSession({
      host: createMemoryHost(),
      documentId: 'missing',
      mode: 'store',
    });
    expect(await session.ready).toBe(false);
    expect(session.status.get()).toMatchObject({ load: 'failed', error: { kind: 'not-found' } });
    expect(session.document.get()).toBeNull();
  });

  it('DOCE-SESSION-1.3 stops loading when its signal aborts', async () => {
    const controller = new AbortController();
    const session = createDocumentSession({
      host: hostWith(),
      documentId: 'doc',
      mode: 'store',
      signal: controller.signal,
    });
    controller.abort();
    expect(await session.ready).toBe(false);
    expect(session.document.get()).toBeNull();
  });

  it('DOCE-SESSION-1.4 follows the capabilities the host changes', async () => {
    const host = hostWith();
    const listeners: ((capabilities: typeof FULL_CAPABILITIES) => void)[] = [];
    host.permissions.subscribe = (_id, listener) => {
      listeners.push(listener);
      return () => undefined;
    };
    const session = open(host);
    await session.ready;
    for (const listener of listeners) listener(READ_ONLY_CAPABILITIES);
    expect(shown(session).editingMode).toBe('read');
  });

  it('DOCE-SESSION-1.5 tells of a newer template and pins another', async () => {
    const host = createMemoryHost({
      documents: [
        { id: 'doc', content: { ...DOCUMENT, template: { id: 'memo', revision: 'rev-1' } } },
      ],
      templates: [
        { formatVersion: 1, id: 'memo' },
        { formatVersion: 1, id: 'memo', page: { size: 'US Letter' } },
      ],
    });
    let onSaved: ((state: SavedState) => void) | null = null;
    const templates = host.templates;
    if (!templates) throw new Error('The host has no templates.');
    templates.subscribe = (_id, listener) => {
      onSaved = listener;
      return () => undefined;
    };
    const session = open(host);
    await session.ready;
    expect(shown(session).pin).toEqual({ id: 'memo', revision: 'rev-1' });
    expect(shown(session).templateUpdate).toBeNull();
    (onSaved as ((state: SavedState) => void) | null)?.({ revision: 'rev-2', sequence: 2 });
    expect(shown(session).templateUpdate).toEqual({ revision: 'rev-2', sequence: 2 });
    expect(await session.setTemplate({ id: 'memo', revision: 'rev-2' })).toBe(true);
    expect(shown(session).template.page?.size).toBe('US Letter');
    expect(session.hasUnsavedChanges()).toBe(true);
  });
});

describe('store-mode saving', () => {
  it('DOCE-SESSION-2.1 leaves a document clean after a change of ids or authorship alone', async () => {
    const session = open(hostWith());
    await session.ready;
    session.update((state) => {
      const text = afterFirst(state) - 1;
      const paragraph = text - 1;
      const contributor = state.schema.marks.contributor?.create({ dataAuthor: 'ada' });
      if (!contributor) throw new Error('The schema has no contributor mark.');
      return state.apply(
        state.tr
          .setNodeAttribute(paragraph, 'dataId', 'b0000002')
          .setNodeAttribute(paragraph, 'dataAuthor', 'ada')
          .addMark(text, text + 2, contributor),
      );
    });
    const { doc } = shown(session).state;
    expect(doc.nodeAt(afterFirst(shown(session).state) - 2)?.attrs.dataId).toBe('b0000002');
    expect(session.status.get().dirty).toBe(false);
    expect(session.hasUnsavedChanges()).toBe(false);
    expect(session.status.get().save).toBe('idle');
    typeText(session, 'Oh ');
    expect(session.hasUnsavedChanges()).toBe(true);
    expect(session.status.get()).toMatchObject({ save: 'dirty', dirty: true });
  });

  it('DOCE-SESSION-2.2 saves against the revision it was edited from', async () => {
    const host = hostWith();
    const session = open(host);
    await session.ready;
    typeText(session, 'Oh ');
    const saving = session.save();
    expect(session.status.get().save).toBe('saving');
    await saving;
    expect(session.status.get()).toMatchObject({ save: 'saved', dirty: false });
    expect(await storedText(host)).toContain('HOh ello');
    typeText(session, 'Ah ');
    await session.save();
    expect(session.status.get().error).toBeNull();
    expect(await storedText(host)).toContain('HAh Oh ello');
  });

  it('DOCE-SESSION-2.2 reports a failed save and keeps the change to retry', async () => {
    const host = hostWith();
    const session = open(host);
    await session.ready;
    await host.documents.save('doc', { content: DOCUMENT, baseRevision: 'rev-1' });
    typeText(session, 'Oh ');
    await session.save();
    expect(session.status.get()).toMatchObject({ save: 'error', error: { kind: 'conflict' } });
    expect(session.hasUnsavedChanges()).toBe(true);
  });

  it('DOCE-SESSION-2.3 saves by itself after a pause in the changes', async () => {
    vi.useFakeTimers();
    const host = hostWith();
    const session = open(host, 500);
    await session.ready;
    typeText(session, 'Oh ');
    await vi.advanceTimersByTimeAsync(400);
    typeText(session, 'Ah ');
    await vi.advanceTimersByTimeAsync(400);
    expect(session.status.get().save).toBe('dirty');
    await vi.advanceTimersByTimeAsync(100);
    expect(session.status.get().save).toBe('saved');
    expect(await storedText(host)).toContain('HAh Oh ello');
  });

  it('DOCE-SESSION-2.4 never empties a stored document by itself', async () => {
    vi.useFakeTimers();
    const host = hostWith();
    const session = open(host, 100);
    await session.ready;
    session.update((state) =>
      state.apply(state.tr.delete(afterFirst(state) - 1, afterFirst(state) + 4)),
    );
    await vi.advanceTimersByTimeAsync(200);
    expect(await session.flush()).toBe(false);
    expect(await storedText(host)).toContain('Hello');
    await session.save();
    expect(await storedText(host)).not.toContain('Hello');
  });

  it('DOCE-SESSION-2.5 flushes what is unsaved at once', async () => {
    const host = hostWith();
    const session = open(host, 60_000);
    await session.ready;
    typeText(session, 'Oh ');
    expect(await session.flush()).toBe(true);
    expect(await storedText(host)).toContain('HOh ello');
  });
});

describe('unsaved-changes guard', () => {
  it('DOCE-SESSION-5.1 says whether changes are unsaved until they are kept', async () => {
    const session = open(hostWith(), 60_000);
    await session.ready;
    expect(session.hasUnsavedChanges()).toBe(false);
    typeText(session, 'Oh ');
    expect(session.hasUnsavedChanges()).toBe(true);
    await session.save();
    expect(session.hasUnsavedChanges()).toBe(false);
  });

  it('DOCE-SESSION-5.2 keeps its changes when the page is hidden or left', async () => {
    const host = hostWith();
    const events: ((event: LifecycleEvent) => void)[] = [];
    host.lifecycle = {
      subscribe: (listener) => {
        events.push(listener);
        return () => undefined;
      },
    };
    const session = open(host, 60_000);
    await session.ready;
    typeText(session, 'Oh ');
    for (const listener of events) listener('hidden');
    await vi.waitFor(async () => expect(await storedText(host)).toContain('HOh ello'));
    session.close();
    typeText(session, 'Ah ');
    for (const listener of events) listener('leaving');
    expect(await storedText(host)).not.toContain('Ah ');
  });
});
