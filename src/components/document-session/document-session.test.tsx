import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { installEditorDom } from '../../../test/editor-dom.js';
import type { EditorHost } from '../../host/adapters.js';
import { READ_ONLY_CAPABILITIES } from '../../host/capabilities.js';
import { createMemoryHost } from '../../host/memory-host.js';
import type { DocumentFile } from '../../model/format/document-format.js';
import { DocumentEditor } from '../document-editor/document-editor.js';
import { DocumentSessionBoundary, useDocumentSession } from './document-session.js';

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

function Host({ host, documentId }: { host: EditorHost; documentId: string }) {
  const session = useDocumentSession({ host, documentId, mode: 'store', autosaveDelay: 0 });
  if (!session) return null;
  return (
    <DocumentSessionBoundary
      session={session}
      fallback={<p>Opening</p>}
      renderError={(error) => <p role="alert">{error?.kind}</p>}
    >
      {(props) => <DocumentEditor {...props} aria-label="Report" />}
    </DocumentSessionBoundary>
  );
}

const stored = async (host: EditorHost) => {
  const loaded = await host.documents.load('doc');
  return loaded.ok ? JSON.stringify(loaded.value.content) : '';
};

installEditorDom();

describe('DocumentSessionBoundary', () => {
  it('DOCE-SESSION-1.6 DOCE-SESSION-2.1 shows the fallback, then the editor, and saves what is typed', async () => {
    const user = userEvent.setup();
    const host = createMemoryHost({ documents: [{ id: 'doc', content: DOCUMENT }] });
    render(<Host host={host} documentId="doc" />);
    expect(screen.getByText('Opening')).toBeInTheDocument();
    const editor = await screen.findByRole('textbox', { name: 'Report' });
    expect(editor).toHaveTextContent('Hello');
    // What the editor derives on opening, such as heading levels, is not a change to save.
    await new Promise((resolve) => setTimeout(resolve, 50));
    const versions = await host.versions?.list('doc');
    expect(versions?.ok && versions.value).toHaveLength(1);
    // The pages, drawn in a view of their own once laid out (DOCE-EDITOR-1.8), take the typing.
    await user.click(screen.getByRole('textbox', { name: 'Report' }));
    await user.keyboard('!');
    await vi.waitFor(async () => expect(await stored(host)).toContain('!'));
  });

  it('DOCE-SESSION-1.6 shows the error of a document that cannot load', async () => {
    render(<Host host={createMemoryHost()} documentId="missing" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('not-found');
  });

  it('DOCE-SESSION-1.6 shows a reader the document read-only', async () => {
    const host = createMemoryHost({
      documents: [{ id: 'doc', content: DOCUMENT }],
      capabilities: READ_ONLY_CAPABILITIES,
    });
    const { container } = render(<Host host={host} documentId="doc" />);
    await screen.findByRole('textbox', { name: 'Report' });
    expect(container.querySelector('.de-document-editor')).toHaveAttribute('data-mode', 'reading');
  });
});
