import { render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { EditorState } from 'prosemirror-state';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { installEditorDom } from '../../../test/editor-dom.js';
import { createDocumentEditing } from '../../engine/index.js';
import { readDocumentFile, type TemplateFile } from '../../model/index.js';
import { EditorModal, type HostDialogProps } from './dialog-parts.js';
import { DocumentEditor } from './document-editor.js';
import { useDocumentEditor } from './editor-context.js';
import type { DocumentEditorLabels } from './editor-labels.js';

const TEMPLATE: TemplateFile = { formatVersion: 1, id: 'article' };

const initial = () =>
  EditorState.create({
    doc: readDocumentFile(
      {
        formatVersion: 1,
        sections: [
          {
            name: null,
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }],
          },
        ],
      },
      documentSchema,
    ).doc,
    plugins: createDocumentEditing(documentSchema),
  });

function Details({ view, onClose }: HostDialogProps) {
  return (
    <EditorModal view={view} onClose={onClose} title="Details">
      The details of the selection.
    </EditorModal>
  );
}

const DIALOGS = { details: Details };

// The host's control inside the editor that opens the host's dialog.
function OpenDetails() {
  const editor = useDocumentEditor();
  return (
    <>
      <button type="button" onClick={() => editor?.openDialog({ kind: 'host', name: 'details' })}>
        Open details
      </button>
      <button type="button" onClick={() => editor?.openDialog({ kind: 'figure' })}>
        Open figure
      </button>
      <button type="button" onClick={() => editor?.openDialog({ kind: 'math', display: true })}>
        Open math
      </button>
    </>
  );
}

function Harness({
  editable,
  labels,
}: {
  editable: boolean;
  labels?: Partial<DocumentEditorLabels>;
}) {
  const [state, setState] = useState(initial);
  return (
    <DocumentEditor
      state={state}
      onStateChange={setState}
      template={TEMPLATE}
      layout="web"
      editable={editable}
      dialogs={DIALOGS}
      labels={labels}
      aria-label="Report"
    >
      <OpenDetails />
    </DocumentEditor>
  );
}

installEditorDom();

describe('the dialog the editor shows', () => {
  const details = () => screen.queryByRole('dialog', { name: 'Details' });

  it('DOCE-EDITOR-4.16 opens a dialog of the host while the writer can edit', async () => {
    const user = userEvent.setup();
    render(<Harness editable />);
    await user.click(screen.getByRole('button', { name: 'Open details' }));
    expect(await screen.findByRole('dialog', { name: 'Details' })).toBeInTheDocument();
  });

  it('DOCE-EDITOR-4.16 does not keep a dialog asked for while the document is read', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Harness editable={false} />);
    await user.click(screen.getByRole('button', { name: 'Open details' }));
    expect(details()).not.toBeInTheDocument();
    rerender(<Harness editable />);
    expect(details()).not.toBeInTheDocument();
  });

  it('DOCE-EDITOR-4.16 closes a dialog for good once the document is read', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Harness editable />);
    await user.click(screen.getByRole('button', { name: 'Open details' }));
    expect(await screen.findByRole('dialog', { name: 'Details' })).toBeInTheDocument();
    rerender(<Harness editable={false} />);
    expect(details()).not.toBeInTheDocument();
    rerender(<Harness editable />);
    expect(details()).not.toBeInTheDocument();
  });

  it('DOCE-ENTRY-2.2 loads the figure dialog on first use, then focuses it and hands focus back', async () => {
    const user = userEvent.setup();
    render(<Harness editable />);
    await user.click(screen.getByRole('button', { name: 'Open figure' }));
    const dialog = await screen.findByRole('dialog', { name: 'Figure' });
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Figure' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Report' })).toHaveFocus();
  });

  it('DOCE-EDITOR-4.5 shows a cheat sheet of common math and a link to the full reference under the preview', async () => {
    const user = userEvent.setup();
    render(<Harness editable />);
    await user.click(screen.getByRole('button', { name: 'Open math' }));
    const dialog = await screen.findByRole('dialog', { name: 'Display math' });
    const sheet = within(dialog).getByRole('region', { name: 'Common math' });
    expect(within(sheet).getByText('Fraction')).toBeInTheDocument();
    expect(within(sheet).getByText('\\frac{a}{b}')).toBeInTheDocument();
    expect(within(sheet).getByRole('link', { name: /^Full LaTeX math reference/ })).toHaveAttribute(
      'href',
      'https://en.wikibooks.org/wiki/LaTeX/Mathematics',
    );
    // The preview says invalid math is invalid, with its reason, and recovers once it is fixed.
    await user.type(within(dialog).getByRole('textbox', { name: 'LaTeX' }), '\\frac{{a}');
    expect(await within(dialog).findByText('Invalid math')).toBeInTheDocument();
    await user.type(within(dialog).getByRole('textbox', { name: 'LaTeX' }), '{{}{{b}');
    await waitFor(() => expect(within(dialog).queryByText('Invalid math')).not.toBeInTheDocument());
    // Closed and opened again, the dialog starts afresh.
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Open math' }));
    const again = await screen.findByRole('dialog', { name: 'Display math' });
    expect(within(again).getByRole('textbox', { name: 'LaTeX' })).toHaveValue('');
  });

  it("DOCE-EDITOR-4.5 shows the host's words for the math cheat sheet and its link", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        editable
        labels={{
          mathCheatSheet: 'Cheat sheet',
          mathReference: 'LaTeX documentation',
          mathReferenceHref: 'https://example.com/latex',
        }}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Open math' }));
    const dialog = await screen.findByRole('dialog', { name: 'Display math' });
    const sheet = within(dialog).getByRole('region', { name: 'Cheat sheet' });
    expect(within(sheet).getByRole('link', { name: /^LaTeX documentation/ })).toHaveAttribute(
      'href',
      'https://example.com/latex',
    );
  });
});
