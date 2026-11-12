import { TextSelection } from 'prosemirror-state';
import { describe, expect, it, vi } from 'vitest';
import type { DocumentStoreAdapter, EditorHost } from '../host/adapters.js';
import { createMemoryHost } from '../host/memory-host.js';
import type { DocumentFile, StoredNode } from '../model/format/document-format.js';
import { createDocumentSession, type DocumentSession } from './document-session.js';

const paragraph = (id: string, text: string): StoredNode => ({
  type: 'paragraph',
  attrs: { id },
  content: [{ type: 'text', text }],
});

const DOCUMENT: DocumentFile = {
  formatVersion: 1,
  sections: [
    {
      name: null,
      content: [paragraph('a0000001', 'First'), paragraph('a0000002', 'Second')],
    },
  ],
};

// A memory host whose store tells of no saves, so only a conflicting save brings others' changes.
function hostWithoutFeed(): EditorHost {
  const host = createMemoryHost({ documents: [{ id: 'doc', content: DOCUMENT }] });
  const { load, save }: DocumentStoreAdapter = host.documents;
  return { ...host, documents: { load, save } };
}

const open = (host: EditorHost) =>
  createDocumentSession({ host, documentId: 'doc', mode: 'store', autosaveDelay: 60_000 });

const shownDoc = (session: DocumentSession) => {
  const document = session.document.get();
  if (!document) throw new Error('The session has no document.');
  return document.state.doc;
};

// Each paragraph's text, in order.
const paragraphs = (session: DocumentSession) => {
  const found: string[] = [];
  shownDoc(session).descendants((node) => {
    if (node.type.name === 'paragraph') found.push(node.textContent);
    return !node.isTextblock;
  });
  return found;
};

// The position at the end of the paragraph with this text.
function endOf(session: DocumentSession, text: string): number {
  let at = -1;
  shownDoc(session).descendants((node, pos) => {
    if (node.isTextblock && node.textContent === text) at = pos + 1 + node.content.size;
    return at < 0 && !node.isTextblock;
  });
  if (at < 0) throw new Error(`No paragraph reads ${text}.`);
  return at;
}

// Types at the end of a paragraph, leaving the caret after the text typed.
function typeAt(session: DocumentSession, paragraphText: string, text: string) {
  const at = endOf(session, paragraphText);
  session.update((state) => {
    const tr = state.tr.insertText(text, at);
    return state.apply(tr.setSelection(TextSelection.create(tr.doc, at + text.length)));
  });
}

// Another writer's save, changing the stored paragraph with an id to a new text.
async function saveAsAnotherWriter(host: EditorHost, id: string, text: string) {
  const stored = await host.documents.load('doc');
  if (!stored.ok) throw new Error('The document is not stored.');
  const content = structuredClone(stored.value.content);
  const [section] = content.sections;
  if (!section) throw new Error('The document has no section.');
  section.content = section.content.map((node) =>
    node.attrs?.id === id ? paragraph(id, text) : node,
  );
  await host.documents.save('doc', { content, baseRevision: stored.value.revision });
}

const storedText = async (host: EditorHost) => {
  const loaded = await host.documents.load('doc');
  return loaded.ok ? JSON.stringify(loaded.value.content) : '';
};

describe('store-mode merges', () => {
  it('DOCE-SESSION-4.1 merges a conflicting save that changed other blocks, without a prompt', async () => {
    const host = hostWithoutFeed();
    const session = open(host);
    await session.ready;
    await saveAsAnotherWriter(host, 'a0000002', 'Second, theirs');
    typeAt(session, 'First', ', mine');
    await session.save();
    expect(session.conflicts.get()).toEqual([]);
    expect(paragraphs(session)).toEqual(['First, mine', 'Second, theirs']);
    expect(session.status.get()).toMatchObject({ save: 'dirty', error: null });
    expect(await session.flush()).toBe(true);
    const stored = await storedText(host);
    expect(stored).toContain('First, mine');
    expect(stored).toContain('Second, theirs');
  });

  it('DOCE-SESSION-4.1 keeps the reader’s caret through the merge', async () => {
    const host = hostWithoutFeed();
    const session = open(host);
    await session.ready;
    await saveAsAnotherWriter(host, 'a0000001', 'First, theirs');
    typeAt(session, 'Second', ', mine');
    const caret = endOf(session, 'Second, mine');
    await session.save();
    expect(paragraphs(session)).toEqual(['First, theirs', 'Second, mine']);
    expect(session.document.get()?.state.selection.head).toBe(caret + ', theirs'.length);
  });

  it('DOCE-SESSION-4.2 holds the save until the reader settles a block both changed', async () => {
    const host = hostWithoutFeed();
    const session = open(host);
    await session.ready;
    await saveAsAnotherWriter(host, 'a0000001', 'First, theirs');
    typeAt(session, 'First', ', mine');
    await session.save();
    expect(session.conflicts.get()).toMatchObject([{ id: 'a0000001' }]);
    expect(session.status.get()).toMatchObject({ save: 'error', error: { kind: 'conflict' } });
    expect(paragraphs(session)).toEqual(['First, mine', 'Second']);
    expect(await session.flush()).toBe(false);
    expect(await storedText(host)).not.toContain('First, mine');
    await session.resolveConflict('a0000001', 'theirs');
    expect(session.conflicts.get()).toEqual([]);
    expect(paragraphs(session)).toEqual(['First, theirs', 'Second']);
    expect(session.hasUnsavedChanges()).toBe(false);
  });

  it('DOCE-SESSION-4.2 keeps both texts when the reader asks, then saves', async () => {
    const host = hostWithoutFeed();
    const session = open(host);
    await session.ready;
    await saveAsAnotherWriter(host, 'a0000001', 'First, theirs');
    typeAt(session, 'First', ', mine');
    await session.save();
    await session.resolveConflict('a0000001', 'both');
    expect(paragraphs(session)).toEqual(['First, mine', 'First, theirs', 'Second']);
    expect(session.status.get().save).toBe('dirty');
    expect(await session.flush()).toBe(true);
    expect(await storedText(host)).toContain('First, mine');
  });
});

describe('store-mode refresh', () => {
  it('DOCE-SESSION-7.1 shows another writer’s save while the reader has no changes', async () => {
    const host = createMemoryHost({ documents: [{ id: 'doc', content: DOCUMENT }] });
    const session = open(host);
    await session.ready;
    await saveAsAnotherWriter(host, 'a0000002', 'Second, theirs');
    await vi.waitFor(() => expect(paragraphs(session)).toEqual(['First', 'Second, theirs']));
    expect(session.status.get()).toMatchObject({ save: 'idle', dirty: false });
  });

  it('DOCE-SESSION-7.1 merges another writer’s save into the reader’s unsaved changes', async () => {
    const host = createMemoryHost({ documents: [{ id: 'doc', content: DOCUMENT }] });
    const session = open(host);
    await session.ready;
    typeAt(session, 'First', ', mine');
    await saveAsAnotherWriter(host, 'a0000002', 'Second, theirs');
    await vi.waitFor(() => expect(paragraphs(session)).toEqual(['First, mine', 'Second, theirs']));
    expect(session.hasUnsavedChanges()).toBe(true);
    await session.save();
    expect(session.status.get()).toMatchObject({ save: 'saved', error: null });
  });

  it('DOCE-SESSION-7.1 does not take in its own saves', async () => {
    const host = createMemoryHost({ documents: [{ id: 'doc', content: DOCUMENT }] });
    const session = open(host);
    await session.ready;
    typeAt(session, 'First', ', mine');
    const before = session.document.get();
    await session.save();
    await Promise.resolve();
    expect(session.document.get()?.state).toBe(before?.state);
  });
});
