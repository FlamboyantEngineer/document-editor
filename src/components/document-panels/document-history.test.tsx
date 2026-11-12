import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { FULL_CAPABILITIES } from '../../host/capabilities.js';
import { createMemoryHost } from '../../host/memory-host.js';
import type { DocumentFile } from '../../model/format/document-format.js';
import { createDocumentSession } from '../../session/document-session.js';
import { createDocumentVersions, type DocumentVersions } from '../../session/versions.js';
import { useSessionValue } from '../document-session/document-session.js';
import {
  DocumentHistory,
  DocumentHistoryBanner,
  type DocumentHistoryProps,
  historicalEditorProps,
  useDocumentVersions,
} from './document-history.js';

const paragraph = (text: string): DocumentFile => ({
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

type Markup = 'all' | 'final';

async function openHistory(capabilities = FULL_CAPABILITIES) {
  const host = createMemoryHost({
    capabilities,
    person: { id: 'ada', name: 'Ada Lovelace' },
    documents: [{ id: 'doc', content: paragraph('One') }],
  });
  await host.documents.save('doc', { content: paragraph('Two'), baseRevision: 'rev-1' });
  await host.versions?.rename?.('doc', 'rev-2', 'Draft');
  await host.documents.save('doc', { content: paragraph('Three'), baseRevision: 'rev-2' });
  const session = createDocumentSession({ host, documentId: 'doc', mode: 'store' });
  await session.ready;
  const versions = createDocumentVersions<Markup>({ host, session });
  return { host, session, versions };
}

// A host that shows the document or the version viewed, and keeps its markup through a view.
function Host({
  versions,
  ...props
}: Partial<DocumentHistoryProps<Markup>> & { versions: DocumentVersions<Markup> }) {
  const [markup, setMarkup] = useState<Markup>('all');
  const view = useSessionValue(versions.view);
  const shown = view ? historicalEditorProps(versions, { view }) : null;
  return (
    <>
      <DocumentHistoryBanner versions={versions} onReturn={setMarkup} />
      <p>{`Markup ${markup}`}</p>
      <p>{shown ? `Shown ${shown.state.doc.textContent}` : 'Shown current'}</p>
      <p>{shown?.compare ? `Compared ${shown.compare.previous.textContent}` : null}</p>
      <button type="button" onClick={() => setMarkup('final')}>
        Final
      </button>
      <DocumentHistory
        versions={versions}
        capabilities={FULL_CAPABILITIES}
        returnTo={markup}
        onReturn={setMarkup}
        {...props}
      />
    </>
  );
}

const row = (name: RegExp) => screen.findByRole('row', { name });

describe('DocumentHistory', () => {
  it('DOCE-VERSIONS-4.6 lists named versions with the automatic ones folded under them', async () => {
    const { host, versions } = await openHistory();
    render(<Host versions={versions} identity={host.identity} />);
    expect(await row(/Draft/)).toBeVisible();
    expect(screen.getAllByRole('row')).toHaveLength(2);
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: /1 earlier version under Draft/ }));
    expect(screen.getAllByRole('row')).toHaveLength(3);
    expect(await screen.findAllByText(/Ada Lovelace/)).not.toHaveLength(0);
  });

  it('DOCE-VERSIONS-4.3 saves a named version', async () => {
    const { versions } = await openHistory();
    render(<Host versions={versions} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Save version…' }));
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Approved');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await row(/Approved/)).toBeVisible();
  });

  it('DOCE-VERSIONS-5.1 DOCE-VERSIONS-5.3 DOCE-VERSIONS-5.4 views a version, then returns to what the reader had', async () => {
    const { versions } = await openHistory();
    render(<Host versions={versions} />);
    const user = userEvent.setup();
    await user.click(await row(/Draft/));
    expect(await screen.findByText('Shown Two')).toBeVisible();
    expect(screen.getByText(/Viewing Draft/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Final' }));
    expect(screen.getByText('Markup final')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Return to the current version' }));
    expect(screen.getByText('Shown current')).toBeVisible();
    expect(screen.getByText('Markup all')).toBeVisible();
  });

  it('DOCE-VERSIONS-5.2 compares two versions', async () => {
    const { versions } = await openHistory();
    render(<Host versions={versions} />);
    const user = userEvent.setup();
    await user.click(await row(/Draft/));
    await user.click(screen.getAllByRole('row')[0] as HTMLElement);
    await waitFor(() => expect(screen.getByRole('button', { name: /compare/i })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: /compare/i }));
    expect(await screen.findByText('Compared Two')).toBeVisible();
    expect(screen.getByText('Shown Three')).toBeVisible();
  });

  it('DOCE-VERSIONS-4.6 offers only what the reader may do', async () => {
    const { versions } = await openHistory();
    const { rerender } = render(
      <Host versions={versions} capabilities={{ ...FULL_CAPABILITIES, saveVersion: false }} />,
    );
    await row(/Draft/);
    expect(screen.queryByRole('button', { name: 'Save version…' })).not.toBeInTheDocument();
    rerender(<Host versions={versions} capabilities={{ ...FULL_CAPABILITIES, history: false }} />);
    expect(screen.getByText('You cannot open this document’s versions.')).toBeVisible();
    expect(screen.queryByRole('row')).not.toBeInTheDocument();
  });

  it('DOCE-VERSIONS-4.1 follows the versions of the session it is given', async () => {
    const { host, session } = await openHistory();
    function Count() {
      const versions = useDocumentVersions<Markup>({ host, session });
      const list = useSessionValue(
        versions?.list ?? { get: () => null, subscribe: () => () => undefined },
      );
      return <p>{list ? `${String(list.versions.length)} versions` : 'Following'}</p>;
    }
    const { unmount } = render(<Count />);
    expect(await screen.findByText('3 versions')).toBeVisible();
    unmount();
  });

  it('DOCE-VERSIONS-4.7 follows the session’s capabilities unless given its own', async () => {
    const { versions } = await openHistory({ ...FULL_CAPABILITIES, saveVersion: false });
    render(<Host versions={versions} capabilities={undefined} />);
    await row(/Draft/);
    expect(screen.queryByRole('button', { name: 'Save version…' })).not.toBeInTheDocument();
  });
});
