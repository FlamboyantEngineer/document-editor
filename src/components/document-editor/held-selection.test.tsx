import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { EditorState } from 'prosemirror-state';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { installEditorDom } from '../../../test/editor-dom.js';
import { createDocumentEditing } from '../../engine/index.js';
import { readDocumentFile, type TemplateFile } from '../../model/index.js';
import { DocumentEditor } from './document-editor.js';

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
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello world' }] }],
          },
        ],
      },
      documentSchema,
    ).doc,
    plugins: createDocumentEditing(documentSchema),
  });

// The editor beside a host panel's field.
function Harness() {
  const [state, setState] = useState(initial);
  return (
    <>
      <DocumentEditor
        state={state}
        onStateChange={setState}
        template={TEMPLATE}
        layout="web"
        aria-label="Report"
      />
      <input aria-label="Ask" />
    </>
  );
}

installEditorDom();

describe('held selection', () => {
  it('DOCE-EDITOR-4.28 draws the selected text while a host field has focus, until focus comes back', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const document = screen.getByRole('textbox', { name: 'Report' });
    await user.click(document);
    await user.keyboard('{Control>}a{/Control}');
    expect(document.querySelector('.de-held-selection')).not.toBeInTheDocument();
    await user.click(screen.getByRole('textbox', { name: 'Ask' }));
    expect(document.querySelector('.de-held-selection')).toHaveTextContent('Hello world');
    await user.click(document);
    expect(document.querySelector('.de-held-selection')).not.toBeInTheDocument();
  });

  it('DOCE-EDITOR-4.28 marks the caret while a host field has focus', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const document = screen.getByRole('textbox', { name: 'Report' });
    await user.click(document);
    await user.click(screen.getByRole('textbox', { name: 'Ask' }));
    const caret = document.querySelector('.de-held-caret');
    expect(caret).toBeInTheDocument();
    expect(caret).toHaveAttribute('aria-hidden', 'true');
  });
});
