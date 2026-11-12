import { render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import type { EditorHost } from '../../host/adapters.js';
import { createMemoryHost } from '../../host/memory-host.js';
import type { DocumentFile, StoredNode } from '../../model/format/document-format.js';
import { createDocumentSession, type DocumentSession } from '../../session/document-session.js';
import { MergeConflicts } from './merge-conflicts.js';

const paragraph = (id: string, text: string): StoredNode => ({
  type: 'paragraph',
  attrs: { id },
  content: [{ type: 'text', text }],
});

const document = (first: string): DocumentFile => ({
  formatVersion: 1,
  sections: [{ name: null, content: [paragraph('a0000001', first)] }],
});

// A store that tells of no saves, so the conflict shows once the reader's save is refused.
function hostWithoutFeed(): EditorHost {
  const host = createMemoryHost({ documents: [{ id: 'doc', content: document('Hello') }] });
  const { load, save } = host.documents;
  return { ...host, documents: { load, save } };
}

// A session in which the reader and another writer both changed the one paragraph.
async function conflictingSession(host: EditorHost): Promise<DocumentSession> {
  const session = createDocumentSession({
    host,
    documentId: 'doc',
    mode: 'store',
    autosaveDelay: 60_000,
  });
  await session.ready;
  const stored = await host.documents.load('doc');
  if (!stored.ok) throw new Error('The document is not stored.');
  await host.documents.save('doc', {
    content: document('Hello there'),
    baseRevision: stored.value.revision,
  });
  session.update((state) => {
    let end = -1;
    state.doc.descendants((node, pos) => {
      if (node.type.name === 'paragraph') end = pos + node.nodeSize - 1;
      return end < 0;
    });
    const tr = state.tr.insertText(' world', end);
    return state.apply(tr.setSelection(TextSelection.create(tr.doc, end + 6)));
  });
  await session.save();
  return session;
}

const paragraphText = (session: DocumentSession) => {
  let text = '';
  session.document.get()?.state.doc.descendants((node) => {
    if (node.type.name === 'paragraph') text += node.textContent;
    return !node.isTextblock;
  });
  return text;
};

describe('MergeConflicts', () => {
  it('DOCE-SESSION-4.3 renders nothing while there is no conflict', async () => {
    const session = createDocumentSession({
      host: hostWithoutFeed(),
      documentId: 'doc',
      mode: 'store',
    });
    await session.ready;
    const { container } = render(<MergeConflicts session={session} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('DOCE-SESSION-4.3 shows each block both changed and settles it as the reader chooses', async () => {
    const user = userEvent.setup();
    const host = hostWithoutFeed();
    const session = await conflictingSession(host);
    const { container } = render(<MergeConflicts session={session} />);
    const region = screen.getByRole('region', { name: 'Changes saved by another writer' });
    expect(container.querySelector('.de-merge-conflicts')).toBe(region);
    const conflict = region.querySelector('.de-merge-conflicts__conflict');
    expect(conflict).toHaveAttribute('data-kind', 'changed');
    const choices = within(region).getByRole('group', {
      name: 'Another writer changed this block too',
    });
    expect(within(choices).getByRole('button', { name: 'Keep both' })).toBeInTheDocument();
    await user.click(within(choices).getByRole('button', { name: 'Keep theirs' }));
    await waitFor(() => expect(region).not.toBeInTheDocument());
    expect(paragraphText(session)).toBe('Hello there');
  });

  it('DOCE-SESSION-4.3 keeps both texts', async () => {
    const user = userEvent.setup();
    const session = await conflictingSession(hostWithoutFeed());
    render(<MergeConflicts session={session} labels={{ keepBoth: 'Both' }} />);
    await user.click(screen.getByRole('button', { name: 'Both' }));
    await waitFor(() => expect(session.conflicts.get()).toEqual([]));
    expect(paragraphText(session)).toBe('Hello worldHello there');
  });
});
