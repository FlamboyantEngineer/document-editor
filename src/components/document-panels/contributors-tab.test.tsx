import { render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { EditorState } from 'prosemirror-state';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { installEditorDom } from '../../../test/editor-dom.js';
import { createDocumentEditing } from '../../engine/index.js';
import { createMemoryHost } from '../../host/index.js';
import { readDocumentFile, type TemplateFile } from '../../model/index.js';
import { DocumentEditor } from '../document-editor/document-editor.js';
import { DocumentSidePanel } from './document-side-panel.js';

const TEMPLATE: TemplateFile = { formatVersion: 1, id: 'article' };

const initial = () =>
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
                attrs: { id: 'p1', author: 'grace' },
                content: [
                  { type: 'text', text: 'Alpha ' },
                  {
                    type: 'text',
                    text: 'drafted',
                    marks: [{ type: 'contributor', attrs: { author: 'agent', aiSession: 's1' } }],
                  },
                ],
              },
            ],
          },
        ],
      },
      documentSchema,
    ).doc,
    plugins: createDocumentEditing(documentSchema),
  });

// A host that shows who wrote what exactly while the contributors pane is the one shown: selected
// in an expanded panel.
function Host() {
  const [state, setState] = useState(initial);
  const [memory] = useState(() =>
    createMemoryHost({
      person: { id: 'ada', name: 'Ada Lovelace' },
      people: [{ id: 'grace', name: 'Grace Hopper' }],
    }),
  );
  const [pane, setPane] = useState<string>('properties');
  const [expanded, setExpanded] = useState(true);
  return (
    <DocumentEditor
      state={state}
      onStateChange={setState}
      template={TEMPLATE}
      layout="web"
      aria-label="Report"
      authorship={pane === 'contributors' && expanded}
      comments={
        memory.comments
          ? { store: memory.comments, documentId: 'doc', identity: memory.identity }
          : undefined
      }
      panels={{
        end: (
          <DocumentSidePanel
            position="end"
            template={TEMPLATE}
            panes={['properties', 'contributors']}
            selectedPane={pane}
            onSelectedPaneChange={setPane}
            isExpanded={expanded}
            onExpandedChange={setExpanded}
          />
        ),
      }}
    />
  );
}

installEditorDom();

describe('the contributors tab', () => {
  it('DOCE-EDITOR-8.1 DOCE-COLLAB-3.4 lets a host show authorship exactly while the contributors pane shows, keeping its rows', async () => {
    const user = userEvent.setup();
    const { container } = render(<Host />);
    const root = container.querySelector('.de-document-editor');
    const details = screen.getByRole('region', { name: 'Details' });
    expect(root).not.toHaveAttribute('data-authorship', 'true');
    await user.click(within(details).getByRole('tab', { name: 'Contributors' }));
    expect(root).toHaveAttribute('data-authorship', 'true');
    const rows = within(screen.getByRole('region', { name: 'Contributors' })).getAllByRole(
      'listitem',
    );
    expect(rows.map((row) => row.getAttribute('data-author'))).toEqual(['agent', 'grace']);
    // Another tab hides it.
    await user.click(within(details).getByRole('tab', { name: 'Properties' }));
    expect(root).not.toHaveAttribute('data-authorship', 'true');
    // Back on the tab it shows again, with the same row elements.
    await user.click(within(details).getByRole('tab', { name: 'Contributors' }));
    expect(root).toHaveAttribute('data-authorship', 'true');
    const again = within(screen.getByRole('region', { name: 'Contributors' })).getAllByRole(
      'listitem',
    );
    expect(again).toEqual(rows);
    // Collapsing the panel hides it too.
    await user.click(within(details).getByRole('button', { name: /collapse/i }));
    expect(root).not.toHaveAttribute('data-authorship', 'true');
  });
});
