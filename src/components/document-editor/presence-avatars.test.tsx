import { render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { EditorState } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { installEditorDom } from '../../../test/editor-dom.js';
import { createDocumentEditing, createPresence, type Peer, setPeers } from '../../engine/index.js';
import { readDocumentFile, type TemplateFile } from '../../model/index.js';
import { DocumentEditor } from './document-editor.js';
import { DocumentPresence } from './presence-avatars.js';

const TEMPLATE: TemplateFile = { formatVersion: 1, id: 'article' };

const PEERS: Peer[] = [
  { id: 'grace', name: 'Grace', email: 'grace@example.com', activity: 'editing', head: 2 },
  { id: 'alan', name: 'Alan', activity: 'reviewing', status: 'idle', head: 4 },
];

function stateWith(peers: readonly Peer[]) {
  const state = EditorState.create({
    doc: readDocumentFile(
      {
        formatVersion: 1,
        sections: [
          {
            name: null,
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Alpha beta gamma' }] }],
          },
        ],
      },
      documentSchema,
    ).doc,
    plugins: [...createDocumentEditing(documentSchema), createPresence()],
  });
  return state.apply(setPeers(state, peers));
}

installEditorDom();

const editor = (peers: readonly Peer[]) => (
  <DocumentEditor
    state={stateWith(peers)}
    onStateChange={() => undefined}
    template={TEMPLATE}
    layout="web"
    toolbar
    onModeChange={() => undefined}
    aria-label="Report"
  />
);

describe('DocumentPresence', () => {
  it('DOCE-COLLAB-1.3 shows the other people in the toolbar, just before the editing mode', () => {
    const { container } = render(editor(PEERS));
    const group = container.querySelector('[data-group="mode"]');
    if (!(group instanceof HTMLElement)) throw new Error('No mode group.');
    const items = [...group.querySelectorAll('[data-item]')].map((item) =>
      item.getAttribute('data-item'),
    );
    expect(items.slice(0, 2)).toEqual(['presence', 'mode']);
    const people = within(group).getByRole('group', { name: 'People in this document' });
    expect(people.querySelector('[data-status="idle"]')).not.toBeNull();
    expect(within(people).getByRole('button', { name: /Alan/ })).toHaveAccessibleName(/Idle/);
    expect(within(people).getByRole('button', { name: /Grace/ })).toHaveAccessibleName(/Editing/);
  });

  it('DOCE-COLLAB-1.3 shows at most five people, counting the others', () => {
    const many: Peer[] = ['Ada', 'Ben', 'Cy', 'Dee', 'Eve', 'Fay', 'Gus'].map((name, index) => ({
      id: name.toLowerCase(),
      name,
      head: index + 1,
    }));
    render(editor(many));
    const people = screen.getByRole('group', { name: 'People in this document' });
    expect(within(people).getByRole('button', { name: /Eve/ })).toBeInTheDocument();
    expect(within(people).queryByRole('button', { name: /^Fay/ })).not.toBeInTheDocument();
    expect(people).toHaveTextContent('+2');
  });

  it('DOCE-COLLAB-1.3 shows no avatars while no one else is in the document', () => {
    const { container } = render(editor([]));
    expect(container.querySelector('[data-item="presence"]')).toBeNull();
    expect(container.querySelector('[data-item="mode"]')).not.toBeNull();
  });

  it('DOCE-COLLAB-1.3 opens a person’s card on hover: name, email and what they are doing', async () => {
    const user = userEvent.setup();
    render(editor(PEERS));
    await user.hover(screen.getByRole('button', { name: /Grace/ }));
    const card = await screen.findByText('grace@example.com');
    const identity = card.closest('.de-document-editor__presence-card');
    expect(identity).not.toBeNull();
    expect(identity).toHaveTextContent('Grace');
    expect(identity?.querySelector('[data-presence-activity="editing"]')).toHaveTextContent(
      'Editing',
    );
  });

  it('DOCE-COLLAB-1.3 lets the host draw the card', async () => {
    const user = userEvent.setup();
    render(
      <DocumentEditor
        state={stateWith(PEERS)}
        onStateChange={() => undefined}
        template={TEMPLATE}
        layout="web"
        aria-label="Hosted"
      >
        <DocumentPresence renderCard={(peer) => <p>Card of {peer.name}</p>} />
      </DocumentEditor>,
    );
    await user.hover(screen.getByRole('button', { name: /Alan/ }));
    expect(await screen.findByText('Card of Alan')).toBeInTheDocument();
  });
});
