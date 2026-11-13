import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { EditorState } from 'prosemirror-state';
import { useEffect, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { installEditorDom } from '../../../test/editor-dom.js';
import { createDocumentEditing } from '../../engine/index.js';
import { readDocumentFile, type TemplateFile } from '../../model/index.js';
import { DocumentEditor } from './document-editor.js';
import type { DocumentLayout } from './use-document-layout.js';

const TEMPLATE: TemplateFile = {
  formatVersion: 1,
  id: 'article',
  page: { size: 'A4', margins: { top: '24px', right: '24px', bottom: '24px', left: '24px' } },
};

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

// The host's chrome inside the editor, with a draft of its own.
function Note({ onMount }: { onMount: () => void }) {
  useEffect(() => {
    onMount();
  }, [onMount]);
  return <input aria-label="Note" />;
}

function Harness({ layout, onMount }: { layout: DocumentLayout; onMount: () => void }) {
  const [state, setState] = useState(initial);
  return (
    <DocumentEditor
      state={state}
      onStateChange={setState}
      template={TEMPLATE}
      layout={layout}
      aria-label="Report"
    >
      <Note onMount={onMount} />
    </DocumentEditor>
  );
}

installEditorDom();

describe('EditorBody', () => {
  it('DOCE-EDITOR-2.2 keeps the chrome inside the editor as the pages start and the layout switches', async () => {
    const user = userEvent.setup();
    const onMount = vi.fn();
    const { rerender } = render(<Harness layout="page" onMount={onMount} />);
    const note = screen.getByRole('textbox', { name: 'Note' });
    const report = () => screen.getByRole('textbox', { name: 'Report' });
    await waitFor(() => expect(report().querySelector('.pm-page')).toBeInTheDocument());
    const paged = report();
    expect(onMount).toHaveBeenCalledTimes(1);
    await user.type(note, 'Check the totals');

    // Each layout draws the document in an element of its own; the chrome is not drawn again.
    rerender(<Harness layout="web" onMount={onMount} />);
    await waitFor(() => expect(report()).not.toBe(paged));
    const joined = report();
    expect(screen.getByRole('textbox', { name: 'Note' })).toBe(note);
    expect(note).toHaveValue('Check the totals');

    rerender(<Harness layout="page" onMount={onMount} />);
    await waitFor(() => expect(report()).not.toBe(joined));
    expect(note).toHaveValue('Check the totals');
    expect(onMount).toHaveBeenCalledTimes(1);
  });
});
