import { PropertyRow } from '@flamboyantengineer/ui-components/property-panel';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { EditorState } from 'prosemirror-state';
import { createRef, type Ref, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { installEditorDom } from '../../../test/editor-dom.js';
import { createDocumentEditing } from '../../engine/index.js';
import { type CommentThread, createMemoryHost } from '../../host/index.js';
import { readDocumentFile, type TemplateFile } from '../../model/index.js';
import type { DocumentCommentsOptions } from '../document-comments/document-comments.js';
import { DocumentEditor } from '../document-editor/document-editor.js';
import type { DocumentEditorHandle } from '../document-editor/editor-handle.js';
import { DocumentContributors } from './document-contributors.js';
import { DocumentSidePanel, type DocumentSidePanelProps } from './document-side-panel.js';

const TEMPLATE: TemplateFile = { formatVersion: 1, id: 'article' };

const thread = (id: string, state: CommentThread['state']): CommentThread => ({
  id,
  state,
  quote: 'Alpha',
  suggestion: null,
  entries: [
    { id: `${id}-1`, author: 'ada', text: `Note ${id}`, createdAt: '2026-01-02T03:04:05Z' },
  ],
});

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
                  { type: 'text', text: 'Alpha beta ' },
                  {
                    type: 'text',
                    text: 'gamma',
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
    plugins: createDocumentEditing(documentSchema),
  });

const host = () =>
  createMemoryHost({
    person: { id: 'ada', name: 'Ada Lovelace' },
    people: [{ id: 'grace', name: 'Grace Hopper' }],
    comments: { threads: { doc: [thread('one', 'open'), thread('two', 'resolved')] } },
  });

function Harness({
  panel,
  handleRef,
  comments = true,
  placement,
  options,
}: {
  panel: Omit<DocumentSidePanelProps, 'position'>;
  handleRef?: Ref<DocumentEditorHandle>;
  comments?: boolean;
  placement?: 'margin' | 'pane';
  /** The comments' other options. */
  options?: Partial<DocumentCommentsOptions>;
}) {
  const [state, setState] = useState(initial);
  const [memory] = useState(host);
  return (
    <DocumentEditor
      state={state}
      onStateChange={setState}
      template={TEMPLATE}
      layout="web"
      aria-label="Report"
      handleRef={handleRef}
      comments={
        comments && memory.comments
          ? {
              store: memory.comments,
              documentId: 'doc',
              identity: memory.identity,
              placement,
              ...options,
            }
          : undefined
      }
      panels={{ end: <DocumentSidePanel position="end" template={TEMPLATE} {...panel} /> }}
    />
  );
}

const details = () => screen.getByRole('region', { name: 'Details' });

installEditorDom();

describe('DocumentSidePanel', () => {
  it('DOCE-EDITOR-8.1 follows a controlled pane and expanded state, reporting each change', async () => {
    const user = userEvent.setup();
    const onSelectedPaneChange = vi.fn();
    const onExpandedChange = vi.fn();
    render(
      <Harness
        panel={{
          panes: ['outline', 'properties'],
          selectedPane: 'properties',
          onSelectedPaneChange,
          onExpandedChange,
          minSize: 240,
          maxSize: 400,
        }}
      />,
    );
    expect(within(details()).getByRole('tab', { name: 'Properties' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await user.click(within(details()).getByRole('tab', { name: 'Outline' }));
    expect(onSelectedPaneChange).toHaveBeenCalledWith('outline');
    // Controlled, the pane stays the host's.
    expect(within(details()).getByRole('tab', { name: 'Properties' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await user.click(within(details()).getByRole('button', { name: /collapse/i }));
    expect(onExpandedChange).toHaveBeenCalledWith(false);
  });

  it('DOCE-EDITOR-8.1 holds its pane and expanded state when uncontrolled', async () => {
    const user = userEvent.setup();
    render(
      <Harness panel={{ panes: ['outline', 'properties'], defaultSelectedPane: 'properties' }} />,
    );
    const outline = within(details()).getByRole('tab', { name: 'Outline' });
    expect(outline).toHaveAttribute('aria-selected', 'false');
    await user.click(outline);
    expect(outline).toHaveAttribute('aria-selected', 'true');
  });

  it('DOCE-EDITOR-8.2 reveals a pane through the handle, expanding its panel and focusing it', async () => {
    const handle = createRef<DocumentEditorHandle>();
    render(
      <Harness
        handleRef={handle}
        panel={{ panes: ['properties', 'contributors'], defaultExpanded: false }}
      />,
    );
    await waitFor(() => expect(handle.current).not.toBeNull());
    expect(handle.current?.revealPane('missing')).toBe(false);
    let revealed = false;
    await waitFor(() => {
      revealed = handle.current?.revealPane('contributors') ?? false;
      expect(revealed).toBe(true);
    });
    const tab = await within(details()).findByRole('tab', { name: 'Contributors' });
    await waitFor(() => expect(tab).toHaveAttribute('aria-selected', 'true'));
    const pane = await screen.findByRole('region', { name: 'Contributors' });
    await waitFor(() =>
      expect(pane.closest('.de-document-side-panel__pane')).toContainElement(
        document.activeElement as HTMLElement,
      ),
    );
  });

  it('DOCE-EDITOR-8.2 reveals a pane without taking focus when asked', async () => {
    const handle = createRef<DocumentEditorHandle>();
    render(<Harness handleRef={handle} panel={{ panes: ['outline', 'properties'] }} />);
    await waitFor(() =>
      expect(handle.current?.revealPane('properties', { focus: false })).toBe(true),
    );
    const tab = within(details()).getByRole('tab', { name: 'Properties' });
    await waitFor(() => expect(tab).toHaveAttribute('aria-selected', 'true'));
    expect(details()).not.toContainElement(document.activeElement as HTMLElement);
  });

  it('DOCE-EDITOR-8.3 adds the comments pane with the open threads counted, only with comments', async () => {
    const { unmount } = render(<Harness panel={{ panes: ['comments', 'properties'] }} />);
    const tab = within(details()).getByRole('tab', { name: /Comments/ });
    await waitFor(() => expect(tab).toHaveTextContent('1'));
    expect(await within(details()).findByText('Note one')).toBeInTheDocument();
    unmount();
    render(<Harness comments={false} panel={{ panes: ['comments', 'properties'] }} />);
    expect(within(details()).queryByRole('tab', { name: /Comments/ })).not.toBeInTheDocument();
  });

  it('DOCE-EDITOR-8.3 DOCE-COMMENTS-4.2 leaves the comments pane its own filter, whatever the margin’s', async () => {
    const user = userEvent.setup();
    render(<Harness options={{ filter: 'open' }} panel={{ panes: ['comments'] }} />);
    const filter = await within(details()).findByRole('radiogroup', { name: 'Show' });
    expect(within(filter).getByRole('radio', { name: /Open/ })).toBeChecked();
    await user.click(within(filter).getByRole('radio', { name: /All/ }));
    expect(within(filter).getByRole('radio', { name: /All/ })).toBeChecked();
    expect(await within(details()).findByText('Note two')).toBeInTheDocument();
  });

  it('DOCE-EDITOR-8.3 DOCE-COMMENTS-4.2 counts no thread the reader is not among the audience of', async () => {
    render(
      <Harness
        options={{ audience: (each) => each.id !== 'one' }}
        panel={{ panes: ['comments', 'properties'] }}
      />,
    );
    const tab = within(details()).getByRole('tab', { name: /Comments/ });
    // Once the threads are listed, All keeps the resolved thread and the suggestion: the open
    // thread is not for the reader.
    await within(details()).findByRole('radio', { name: /All.*2/ });
    expect(tab).not.toHaveTextContent('1');
  });

  it('DOCE-COMMENTS-4.7 reveals the comments pane for a thread started or opened there', async () => {
    const handle = createRef<DocumentEditorHandle>();
    render(
      <Harness
        handleRef={handle}
        placement="pane"
        panel={{ panes: ['properties', 'comments'], defaultExpanded: false }}
      />,
    );
    expect(within(details()).queryByRole('tab', { name: /Comments/ })).not.toBeInTheDocument();
    await waitFor(() => expect(handle.current?.startComment()).toBe(true));
    const tab = await within(details()).findByRole('tab', { name: /Comments/ });
    await waitFor(() => expect(tab).toHaveAttribute('aria-selected', 'true'));
    expect(await within(details()).findByRole('textbox', { name: /comment/i })).toBeVisible();
    await userEvent.setup().click(within(details()).getByRole('tab', { name: 'Properties' }));
    await waitFor(() => expect(tab).toHaveAttribute('aria-selected', 'false'));
    act(() => {
      expect(handle.current?.openThread('one')).toBe(true);
    });
    await waitFor(() => expect(tab).toHaveAttribute('aria-selected', 'true'));
  });

  it('DOCE-EDITOR-8.4 adds the host rows, actions and sections to the properties', async () => {
    const user = userEvent.setup();
    const onPress = vi.fn();
    render(
      <Harness
        panel={{
          panes: ['properties'],
          properties: {
            sections: [
              'document',
              {
                id: 'review',
                title: 'Review',
                render: () => <PropertyRow label="Status">Draft</PropertyRow>,
              },
            ],
            extend: {
              document: {
                renderRows: () => <PropertyRow label="Owner">Ada</PropertyRow>,
                renderActions: () => (
                  <button type="button" onClick={onPress}>
                    Refresh
                  </button>
                ),
              },
            },
          },
        }}
      />,
    );
    const panel = details();
    expect(within(panel).getByText('Review')).toBeInTheDocument();
    expect(within(panel).getByText('Draft')).toBeInTheDocument();
    expect(within(panel).getByText('Owner')).toBeInTheDocument();
    // Only the sections asked for show.
    expect(within(panel).queryByText('Selection')).not.toBeInTheDocument();
    await user.click(within(panel).getByRole('button', { name: 'Refresh' }));
    expect(onPress).toHaveBeenCalled();
    // The words the status bar counts.
    expect(within(panel).getByText('Words').closest('.ui-property-row')).toHaveTextContent('3');
  });
});

describe('DocumentContributors', () => {
  it('DOCE-COLLAB-3.4 lists the writers, the most text first, and toggles authorship', async () => {
    const user = userEvent.setup();
    const onAuthorshipChange = vi.fn();
    render(<Harness panel={{ panes: ['contributors'], onAuthorshipChange }} />);
    const pane = screen.getByRole('region', { name: 'Contributors' });
    const rows = within(pane).getAllByRole('listitem');
    expect(rows[0]).toHaveAttribute('data-author', 'grace');
    expect(rows[1]).toHaveAttribute('data-author', 'ada');
    // Named by the identity adapter, with how much each wrote.
    expect(await within(pane).findByText('Grace Hopper')).toBeInTheDocument();
    expect(within(rows[0] as HTMLElement).getByText('11 characters')).toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).getByText('5 characters')).toBeInTheDocument();
    expect(rows[0]).toHaveAttribute('data-author-slot');
    await user.click(within(pane).getByRole('switch', { name: 'Show who wrote what' }));
    expect(onAuthorshipChange).toHaveBeenCalledWith(true);
  });

  it('DOCE-COLLAB-3.4 shows writers by id and no switch without the host', () => {
    render(
      <DocumentEditor
        state={initial()}
        onStateChange={() => undefined}
        template={TEMPLATE}
        layout="web"
      >
        <DocumentContributors />
      </DocumentEditor>,
    );
    const pane = screen.getByRole('region', { name: 'Contributors' });
    expect(within(pane).getByText('grace')).toBeInTheDocument();
    expect(within(pane).queryByRole('switch')).not.toBeInTheDocument();
  });
});
