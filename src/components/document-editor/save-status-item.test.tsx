import { act, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { EditorState } from 'prosemirror-state';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { installEditorDom } from '../../../test/editor-dom.js';
import { createDocumentEditing, type ShortcutOverrides } from '../../engine/index.js';
import { createMemoryHost, type EditorCapabilities, FULL_CAPABILITIES } from '../../host/index.js';
import { readDocumentFile, type TemplateFile } from '../../model/index.js';
import type { SessionStatus } from '../../session/status.js';
import { DocumentEditor } from './document-editor.js';
import type { EditorSession } from './save-status-item.js';

const TEMPLATE: TemplateFile = { formatVersion: 1, id: 'article' };

const IDLE: SessionStatus = { load: 'ready', save: 'idle', error: null, dirty: false };

// A session whose status the test sets, recording each save it is asked for.
function stubSession(save: () => Promise<void> = () => Promise.resolve()) {
  let status = IDLE;
  const listeners = new Set<(status: SessionStatus) => void>();
  const session = {
    status: {
      get: () => status,
      subscribe: (listener: (status: SessionStatus) => void) => {
        listeners.add(listener);
        return () => void listeners.delete(listener);
      },
    },
    save: vi.fn(save),
  } satisfies EditorSession;
  const setStatus = (next: Partial<SessionStatus>) =>
    act(() => {
      status = { ...status, ...next };
      for (const listener of listeners) listener(status);
    });
  return { session, setStatus };
}

const initial = (options: Parameters<typeof createDocumentEditing>[1] = {}) =>
  EditorState.create({
    doc: readDocumentFile(
      {
        formatVersion: 1,
        sections: [
          {
            name: null,
            content: [
              {
                type: 'paragraph',
                content: [
                  { type: 'text', text: 'Alpha ' },
                  {
                    type: 'text',
                    text: 'beta',
                    marks: [{ type: 'insertion', attrs: { id: 's1', author: 'ada' } }],
                  },
                ],
              },
            ],
          },
        ],
      },
      documentSchema,
    ).doc,
    plugins: createDocumentEditing(documentSchema, options),
  });

function Harness({
  session,
  capabilities,
  shortcuts,
}: {
  session?: EditorSession;
  capabilities?: EditorCapabilities;
  shortcuts?: ShortcutOverrides;
}) {
  const [state, setState] = useState(() => initial({ shortcuts }));
  const [host] = useState(() => createMemoryHost({ person: { id: 'ada', name: 'Ada Lovelace' } }));
  return (
    <DocumentEditor
      state={state}
      onStateChange={setState}
      template={TEMPLATE}
      layout="web"
      statusBar
      aria-label="Report"
      session={session}
      capabilities={capabilities}
      comments={
        host.comments
          ? { store: host.comments, documentId: 'doc', identity: host.identity }
          : undefined
      }
    />
  );
}

installEditorDom();

describe('SaveStatusItem', () => {
  it('DOCE-SESSION-9.1 shows where the session changes stand in the status bar', () => {
    const { session, setStatus } = stubSession();
    const { container } = render(<Harness session={session} />);
    const item = container.querySelector('.de-document-editor__status-item[data-status="save"]');
    if (!(item instanceof HTMLElement)) throw new Error('The save item should show.');
    setStatus({ save: 'dirty', dirty: true });
    expect(within(item).getByText(/unsaved/i)).toBeInTheDocument();
    setStatus({ save: 'saving' });
    expect(within(item).getByText(/saving/i)).toBeInTheDocument();
    setStatus({ save: 'saved', dirty: false });
    expect(within(item).getByText(/saved/i)).toBeInTheDocument();
    setStatus({ save: 'offline' });
    expect(within(item).getByText(/offline/i)).toBeInTheDocument();
  });

  it('DOCE-SESSION-9.1 shows no save item without a session', () => {
    const { container } = render(<Harness />);
    expect(container.querySelector('.de-document-editor__status-bar')).toBeInTheDocument();
    expect(
      container.querySelector('.de-document-editor__status-item[data-status="save"]'),
    ).not.toBeInTheDocument();
  });

  it('DOCE-SESSION-9.1 says why a save failed and retries it', async () => {
    const user = userEvent.setup();
    const { session, setStatus } = stubSession(() => Promise.reject(new Error('offline')));
    render(<Harness session={session} />);
    setStatus({ save: 'error', dirty: true, error: { kind: 'unavailable', message: 'No store' } });
    expect(screen.getByText('No store')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(session.save).toHaveBeenCalledTimes(1);
    expect(screen.getByText('No store')).toBeInTheDocument();
  });

  it('DOCE-SESSION-9.2 saves the session with Mod-S in the editor', async () => {
    const user = userEvent.setup();
    const { session } = stubSession();
    render(<Harness session={session} />);
    await user.click(screen.getByRole('textbox', { name: 'Report' }));
    await user.keyboard('{Control>}s{/Control}');
    expect(session.save).toHaveBeenCalledTimes(1);
    await user.keyboard('{Control>}{Shift>}s{/Shift}{/Control}');
    expect(session.save).toHaveBeenCalledTimes(1);
  });

  it('DOCE-SESSION-9.2 saves with the keys the host remapped save to', async () => {
    const user = userEvent.setup();
    const { session } = stubSession();
    render(<Harness session={session} shortcuts={{ save: 'Mod-e' }} />);
    await user.click(screen.getByRole('textbox', { name: 'Report' }));
    await user.keyboard('{Control>}s{/Control}');
    expect(session.save).not.toHaveBeenCalled();
    await user.keyboard('{Control>}e{/Control}');
    expect(session.save).toHaveBeenCalledTimes(1);
  });

  it('DOCE-SESSION-9.3 offers no accept or reject without the decide capability', () => {
    const { rerender } = render(<Harness capabilities={FULL_CAPABILITIES} />);
    expect(screen.getByRole('button', { name: 'Accept' })).toBeInTheDocument();
    rerender(<Harness capabilities={{ ...FULL_CAPABILITIES, decide: false }} />);
    expect(screen.queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument();
  });
});
