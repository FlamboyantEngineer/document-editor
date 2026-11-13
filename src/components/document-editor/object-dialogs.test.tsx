import { render, screen } from '@testing-library/react';
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
    <button type="button" onClick={() => editor?.openDialog({ kind: 'host', name: 'details' })}>
      Open details
    </button>
  );
}

function Harness({ editable }: { editable: boolean }) {
  const [state, setState] = useState(initial);
  return (
    <DocumentEditor
      state={state}
      onStateChange={setState}
      template={TEMPLATE}
      layout="web"
      editable={editable}
      dialogs={DIALOGS}
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
});
