import type { EditorState } from 'prosemirror-state';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EditorHost } from '../host/adapters.js';
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

const hostWith = () => createMemoryHost({ documents: [{ id: 'doc', content: DOCUMENT }] });

// A session that saves only when asked, within the test.
const open = (host: EditorHost) =>
  createDocumentSession({
    host,
    documentId: 'doc',
    mode: 'store',
    autosaveDelay: 60_000,
    draftDelay: 100,
  });

const text = (session: DocumentSession) => {
  const doc = session.document.get()?.state.doc;
  return doc ? doc.textBetween(0, doc.content.size) : '';
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

const typeText = (session: DocumentSession, typed: string) =>
  session.update((state: EditorState) =>
    state.apply(state.tr.insertText(typed, afterFirst(state))),
  );

const keptDraft = async (host: EditorHost) => {
  const read = await host.drafts?.get('doc', 'store');
  return read?.ok ? read.value : null;
};

// A session edited and then lost before it saved, as in a crash.
async function crashAfterTyping(host: EditorHost, typed: string) {
  const session = open(host);
  await session.ready;
  typeText(session, typed);
  await vi.advanceTimersByTimeAsync(150);
}

afterEach(() => {
  vi.useRealTimers();
});

describe('store-mode drafts', () => {
  it('DOCE-SESSION-6.1 keeps unsaved content as a draft shortly after a change', async () => {
    vi.useFakeTimers();
    const host = hostWith();
    const session = open(host);
    await session.ready;
    typeText(session, 'Oh ');
    await vi.advanceTimersByTimeAsync(50);
    expect(await keptDraft(host)).toBeNull();
    await vi.advanceTimersByTimeAsync(100);
    expect(await keptDraft(host)).toMatchObject({ mode: 'store', baseRevision: 'rev-1' });
    expect(JSON.stringify(await keptDraft(host))).toContain('HOh ello');
  });

  it('DOCE-SESSION-6.1 removes the draft once a save leaves nothing unsaved', async () => {
    vi.useFakeTimers();
    const host = hostWith();
    const session = open(host);
    await session.ready;
    typeText(session, 'Oh ');
    await vi.advanceTimersByTimeAsync(150);
    expect(await keptDraft(host)).not.toBeNull();
    await session.save();
    expect(await keptDraft(host)).toBeNull();
  });

  it('DOCE-SESSION-6.2 offers the draft after a crash and restores it as a change to save', async () => {
    vi.useFakeTimers();
    const host = hostWith();
    await crashAfterTyping(host, 'Oh ');
    const session = open(host);
    await session.ready;
    expect(text(session)).toBe('Hello');
    expect(session.draft.get()).toMatchObject({ outdated: false });
    expect(await session.restoreDraft()).toBe(true);
    expect(text(session)).toBe('HOh ello');
    expect(session.draft.get()).toBeNull();
    expect(session.status.get()).toMatchObject({ save: 'dirty', dirty: true });
    await session.save();
    expect(session.status.get().save).toBe('saved');
    expect(await keptDraft(host)).toBeNull();
  });

  it('DOCE-SESSION-6.2 keeps an offered draft while the reader edits before choosing', async () => {
    vi.useFakeTimers();
    const host = hostWith();
    await crashAfterTyping(host, 'Oh ');
    const session = open(host);
    await session.ready;
    typeText(session, 'Ah ');
    await vi.advanceTimersByTimeAsync(150);
    expect(JSON.stringify(await keptDraft(host))).toContain('HOh ello');
  });

  it('DOCE-SESSION-6.3 offers no draft the store already holds', async () => {
    const host = hostWith();
    await host.drafts?.put('doc', {
      mode: 'store',
      content: DOCUMENT,
      baseRevision: 'rev-1',
      savedAt: '2026-01-01T00:00:00.000Z',
    });
    const session = open(host);
    await session.ready;
    expect(session.draft.get()).toBeNull();
    expect(await keptDraft(host)).toBeNull();
  });

  it('DOCE-SESSION-6.4 saves a draft from an older revision against it, as a conflict', async () => {
    vi.useFakeTimers();
    const host = hostWith();
    await crashAfterTyping(host, 'Oh ');
    await host.documents.save('doc', { content: DOCUMENT, baseRevision: 'rev-1' });
    const session = open(host);
    await session.ready;
    expect(session.draft.get()).toMatchObject({ outdated: true });
    await session.restoreDraft();
    await session.save();
    expect(session.status.get()).toMatchObject({ save: 'error', error: { kind: 'conflict' } });
    expect(session.hasUnsavedChanges()).toBe(true);
  });

  it('DOCE-SESSION-6.5 discards the offered draft', async () => {
    vi.useFakeTimers();
    const host = hostWith();
    await crashAfterTyping(host, 'Oh ');
    const session = open(host);
    await session.ready;
    session.discardDraft();
    expect(session.draft.get()).toBeNull();
    expect(text(session)).toBe('Hello');
    expect(await keptDraft(host)).toBeNull();
    expect(await session.restoreDraft()).toBe(false);
  });

  it('DOCE-SESSION-6.6 keeps the draft at once when the page is hidden or left', async () => {
    const host = hostWith();
    const listeners: ((event: LifecycleEvent) => void)[] = [];
    host.lifecycle = {
      subscribe: (listener) => {
        listeners.push(listener);
        return () => undefined;
      },
    };
    host.memory.failNext('documents.save', { kind: 'unavailable' });
    const session = createDocumentSession({
      host,
      documentId: 'doc',
      mode: 'store',
      autosaveDelay: 60_000,
      draftDelay: 60_000,
    });
    await session.ready;
    typeText(session, 'Oh ');
    for (const listener of listeners) listener('leaving');
    expect(JSON.stringify(await keptDraft(host))).toContain('HOh ello');
    await vi.waitFor(() => expect(session.status.get().save).toBe('error'));
    expect(await keptDraft(host)).not.toBeNull();
  });
});
