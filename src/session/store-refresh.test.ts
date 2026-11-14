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
function hostWithoutFeed(content: DocumentFile = DOCUMENT): EditorHost {
  const host = createMemoryHost({ documents: [{ id: 'doc', content }] });
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

// Splits a paragraph at its end, as Enter does: a change of structure, which gives every element
// that has no id one.
function pressEnterAfter(session: DocumentSession, paragraphText: string) {
  const at = endOf(session, paragraphText);
  session.update((state) => {
    const tr = state.tr.split(at);
    return state.apply(tr.setSelection(TextSelection.create(tr.doc, at + 2)));
  });
}

// Another writer's save, changing the stored paragraph with an id to a new text, and the template
// the document pins when one is given.
async function saveAsAnotherWriter(
  host: EditorHost,
  { id, text, template }: { id: string; text: string; template?: DocumentFile['template'] },
) {
  const stored = await host.documents.load('doc');
  if (!stored.ok) throw new Error('The document is not stored.');
  const content = structuredClone(stored.value.content);
  const [section] = content.sections;
  if (!section) throw new Error('The document has no section.');
  section.content = section.content.map((node) =>
    node.attrs?.id === id ? paragraph(id, text) : node,
  );
  if (template) content.template = template;
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
    await saveAsAnotherWriter(host, { id: 'a0000002', text: 'Second, theirs' });
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

  it('DOCE-SESSION-2.5 saves the merge when a flush meets another writer’s save', async () => {
    const host = hostWithoutFeed();
    const session = open(host);
    await session.ready;
    await saveAsAnotherWriter(host, { id: 'a0000002', text: 'Second, theirs' });
    typeAt(session, 'First', ', mine');
    expect(await session.flush()).toBe(true);
    expect(session.status.get()).toMatchObject({ save: 'saved', error: null, dirty: false });
    const stored = await storedText(host);
    expect(stored).toContain('First, mine');
    expect(stored).toContain('Second, theirs');
  });

  it('DOCE-SESSION-4.1 keeps the reader’s caret through the merge', async () => {
    const host = hostWithoutFeed();
    const session = open(host);
    await session.ready;
    await saveAsAnotherWriter(host, { id: 'a0000001', text: 'First, theirs' });
    typeAt(session, 'Second', ', mine');
    const caret = endOf(session, 'Second, mine');
    await session.save();
    expect(paragraphs(session)).toEqual(['First, theirs', 'Second, mine']);
    expect(session.document.get()?.state.selection.head).toBe(caret + ', theirs'.length);
  });

  it('DOCE-SESSION-4.1 merges two writers’ changes to a stored document that has no element ids', async () => {
    const stored: DocumentFile = {
      formatVersion: 1,
      sections: [
        {
          name: null,
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'First' }] },
            { type: 'paragraph', content: [{ type: 'text', text: 'Second' }] },
          ],
        },
      ],
    };
    const host = hostWithoutFeed(stored);
    const ada = open(host);
    const grace = open(host);
    await ada.ready;
    await grace.ready;
    pressEnterAfter(ada, 'First');
    await ada.save();
    pressEnterAfter(grace, 'Second');
    await grace.save();
    expect(grace.conflicts.get()).toEqual([]);
    expect(paragraphs(grace)).toEqual(['First', '', 'Second', '']);
    expect(await grace.flush()).toBe(true);
  });

  it('DOCE-SESSION-4.2 holds the save until the reader settles a block both changed', async () => {
    const host = hostWithoutFeed();
    const session = open(host);
    await session.ready;
    await saveAsAnotherWriter(host, { id: 'a0000001', text: 'First, theirs' });
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
    await saveAsAnotherWriter(host, { id: 'a0000001', text: 'First, theirs' });
    typeAt(session, 'First', ', mine');
    await session.save();
    await session.resolveConflict('a0000001', 'both');
    expect(paragraphs(session)).toEqual(['First, mine', 'First, theirs', 'Second']);
    expect(session.status.get().save).toBe('dirty');
    expect(await session.flush()).toBe(true);
    expect(await storedText(host)).toContain('First, mine');
  });

  it('DOCE-SESSION-4.2 keeps a conflict not yet settled when another save is taken in', async () => {
    const host = createMemoryHost({ documents: [{ id: 'doc', content: DOCUMENT }] });
    const session = open(host);
    await session.ready;
    typeAt(session, 'First', ', mine');
    await saveAsAnotherWriter(host, { id: 'a0000001', text: 'First, theirs' });
    await vi.waitFor(() => expect(session.conflicts.get()).toMatchObject([{ id: 'a0000001' }]));
    await saveAsAnotherWriter(host, { id: 'a0000002', text: 'Second, theirs' });
    await vi.waitFor(() => expect(paragraphs(session)).toEqual(['First, mine', 'Second, theirs']));
    expect(session.conflicts.get()).toMatchObject([{ id: 'a0000001' }]);
    expect(session.status.get()).toMatchObject({ save: 'error', error: { kind: 'conflict' } });
    expect(await session.flush()).toBe(false);
    expect(await storedText(host)).not.toContain('First, mine');
  });

  it('DOCE-SESSION-4.2 drops a conflict when a later save holds the reader’s version', async () => {
    const host = createMemoryHost({ documents: [{ id: 'doc', content: DOCUMENT }] });
    const session = open(host);
    await session.ready;
    typeAt(session, 'First', ', mine');
    await saveAsAnotherWriter(host, { id: 'a0000001', text: 'First, theirs' });
    await vi.waitFor(() => expect(session.conflicts.get()).toHaveLength(1));
    await saveAsAnotherWriter(host, { id: 'a0000001', text: 'First, mine' });
    await vi.waitFor(() => expect(session.conflicts.get()).toEqual([]));
    expect(session.status.get()).toMatchObject({ error: null, dirty: false });
  });
});

describe('store-mode refresh', () => {
  it('DOCE-SESSION-7.1 shows another writer’s save while the reader has no changes', async () => {
    const host = createMemoryHost({ documents: [{ id: 'doc', content: DOCUMENT }] });
    const session = open(host);
    await session.ready;
    await saveAsAnotherWriter(host, { id: 'a0000002', text: 'Second, theirs' });
    await vi.waitFor(() => expect(paragraphs(session)).toEqual(['First', 'Second, theirs']));
    expect(session.status.get()).toMatchObject({ save: 'idle', dirty: false });
  });

  it('DOCE-SESSION-7.1 merges another writer’s save into the reader’s unsaved changes', async () => {
    const host = createMemoryHost({ documents: [{ id: 'doc', content: DOCUMENT }] });
    const session = open(host);
    await session.ready;
    typeAt(session, 'First', ', mine');
    await saveAsAnotherWriter(host, { id: 'a0000002', text: 'Second, theirs' });
    await vi.waitFor(() => expect(paragraphs(session)).toEqual(['First, mine', 'Second, theirs']));
    expect(session.hasUnsavedChanges()).toBe(true);
    await session.save();
    expect(session.status.get()).toMatchObject({ save: 'saved', error: null });
  });

  it('DOCE-SESSION-7.1 keeps what the reader types while a save taken in loads its template', async () => {
    const host = createMemoryHost({
      documents: [{ id: 'doc', content: DOCUMENT }],
      templates: [{ formatVersion: 1, id: 'memo' }],
    });
    const session = open(host);
    await session.ready;
    // The template the other writer pinned loads only once the test lets it.
    const { templates } = host;
    if (!templates) throw new Error('The memory host keeps templates.');
    const load = templates.load.bind(templates);
    let asked = false;
    let release = () => undefined as void;
    templates.load = async (...args) => {
      if (args[0] === 'memo') {
        asked = true;
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      }
      return load(...args);
    };
    await saveAsAnotherWriter(host, {
      id: 'a0000002',
      text: 'Second, theirs',
      template: { id: 'memo', revision: 'rev-1' },
    });
    await vi.waitFor(() => expect(asked).toBe(true));
    typeAt(session, 'First', ', typed meanwhile');
    release();
    await vi.waitFor(() => expect(paragraphs(session)).toContain('Second, theirs'));
    expect(paragraphs(session)).toEqual(['First, typed meanwhile', 'Second, theirs']);
    expect(session.document.get()?.pin).toEqual({ id: 'memo', revision: 'rev-1' });
    expect(session.hasUnsavedChanges()).toBe(true);
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
